const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class DtsxSearcher {
  static isDtsxAvailable() {
    // Vérifier le chemin par défaut
    const rootPath = path.join(__dirname, '../../../../SSIS_DTSX');
    if (fsSync.existsSync(rootPath)) {
      return true;
    }

    // Vérifier le chemin alternatif
    const alternativePath = path.join(__dirname, '../../../SSIS_DTSX');
    return fsSync.existsSync(alternativePath);
  }

  constructor(customDtsxPath = null) {
    // Utiliser le chemin personnalisé s'il est fourni, sinon utiliser le chemin par défaut
    if (customDtsxPath && require('fs').existsSync(customDtsxPath)) {
      this.dtsxRootPath = customDtsxPath;
    } else {
      this.dtsxRootPath = path.join(__dirname, '../../../../SSIS_DTSX');
      
      // Vérifier si le chemin existe, sinon essayer un chemin alternatif
      if (!require('fs').existsSync(this.dtsxRootPath)) {
        // Essayer le chemin relatif au projet
        const alternativePath = path.join(__dirname, '../../../SSIS_DTSX');
        if (require('fs').existsSync(alternativePath)) {
          this.dtsxRootPath = alternativePath;
        }
      }
    }
    
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Méthode pour obtenir le chemin DTSX actuel
  getCurrentDtsxPath() {
    return this.dtsxRootPath;
  }

  /**
   * Recherche un terme dans tous les fichiers DTSX
   * @param {string} searchTerm - Terme à rechercher
   * @param {Array<string>} serverNames - Noms des serveurs à filtrer (optionnel)
   * @param {string} searchMode - Mode de recherche ('fast' ou 'advanced')
   * @param {Array<string>} objectTypes - Types d'objets à rechercher (optionnel)
   * @returns {Promise<Array>} - Résultats de la recherche
   */
  async searchInDtsxFiles(searchTerm, serverNames = null, searchMode = 'fast', objectTypes = null) {
    console.log('=== RECHERCHE DTSX DEBUG ===');
    console.log('searchTerm:', searchTerm);
    console.log('serverNames:', serverNames);
    console.log('searchMode:', searchMode);
    console.log('objectTypes:', objectTypes);
    
    if (!searchTerm || searchTerm.trim().length < 2) {
      console.log('Terme de recherche trop court ou vide');
      return [];
    }

    const results = [];
    const searchTermLower = searchTerm.toLowerCase();
    console.log('searchTermLower:', searchTermLower);

    try {
      // Parcourir tous les serveurs ou seulement ceux filtrés
      let servers = await this.getServers();
      console.log('Serveurs trouvés:', servers);
      
      // Filtrer par les noms de serveurs si spécifiés
      if (serverNames && serverNames.length > 0) {
        servers = servers.filter(server => 
          serverNames.some(serverName => 
            server.toLowerCase().includes(serverName.toLowerCase()) ||
            serverName.toLowerCase().includes(server.toLowerCase())
          )
        );
        console.log('Serveurs filtrés:', servers);
      }
      
      for (const server of servers) {
        const serverPath = path.join(this.dtsxRootPath, server);
        console.log('Traitement serveur:', server, 'Chemin:', serverPath);
        
        const dtsxFiles = await this.getDtsxFiles(serverPath);
        console.log('Fichiers DTSX trouvés pour', server, ':', dtsxFiles.length);
        
        for (const dtsxFile of dtsxFiles) {
          try {
            const filePath = path.join(serverPath, dtsxFile);
            const fileName = path.basename(dtsxFile, '.dtsx');
            
            // Mode rapide : recherche uniquement dans le nom du fichier
            // Si objectTypes est null (recherche normale), on applique le mode rapide
            // Si objectTypes est défini, on vérifie qu'il contient DTSX_PACKAGE
            if (searchMode === 'fast' && (!objectTypes || objectTypes.includes('DTSX_PACKAGE'))) {
              if (fileName.toLowerCase().includes(searchTermLower)) {
                const packageName = path.basename(dtsxFile);
                results.push({
                  name: packageName,
                  object_name: packageName, // Ajouter object_name pour compatibilité
                  server: server,
                  file_path: filePath,
                  relative_path: path.relative(this.dtsxRootPath, filePath),
                  matches: [{ type: 'filename', context: fileName }],
                  search_mode: 'filename_only',
                  description: '', // Ajouter description vide pour compatibilité
                  job_count: 0 // Ajouter job_count pour compatibilité
                });
              }
            } else {
              // Mode normal : recherche dans le contenu (sans charger tous les détails)
              const fileContent = await fs.readFile(filePath, 'utf8');
              
              if (fileContent.toLowerCase().includes(searchTermLower)) {
                // Extraire seulement les informations de base du package
                const basicInfo = await this.extractBasicDtsxInfo(filePath, fileContent);
                
                if (basicInfo) {
                  results.push({
                    ...basicInfo,
                    name: path.basename(dtsxFile),  // Ajout du nom du fichier
                    server: server,
                    file_path: filePath,
                    relative_path: path.relative(this.dtsxRootPath, filePath),
                    matches: this.findMatches(fileContent, searchTermLower)
                  });
                }
              }
            }
          } catch (error) {
            // Erreur silencieuse
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la recherche DTSX:', error);
    }

    console.log('Résultats bruts trouvés:', results.length);
    console.log('Résultats:', results);

    // Regrouper les résultats par nom de base (sans numéro de version)
    const groupedResults = new Map();
    for (const result of results) {
      // Extraire le nom de base (sans le numéro de version entre parenthèses)
      const baseName = result.name.replace(/\s*\(\d+\)\.dtsx$/i, '.dtsx')
                                .replace(/\.dtsx$/i, '');
      
      if (!groupedResults.has(baseName)) {
        groupedResults.set(baseName, []);
      }
      groupedResults.get(baseName).push(result);
    }

    // Pour chaque groupe, ne garder que la version la plus récente
    const finalResults = [];
    for (const versions of groupedResults.values()) {
      if (versions.length === 1) {
        finalResults.push(versions[0]);
      } else {
        // Trier par date de création (la plus récente en premier)
        const sorted = versions.sort((a, b) => {
          // Si les dates de création sont disponibles, les utiliser
          if (a.creation_date && b.creation_date) {
            return new Date(b.creation_date) - new Date(a.creation_date);
          }
          // Sinon, essayer d'extraire le numéro de version du nom
          const versionA = this.extractVersionNumber(a.name);
          const versionB = this.extractVersionNumber(b.name);
          if (versionA !== null && versionB !== null) {
            return versionB - versionA;
          }
          // En dernier recours, garder le premier
          return 0;
        });
        finalResults.push(sorted[0]);
      }
    }

    return finalResults;
  }

  /**
   * Extrait les informations de base d'un fichier DTSX (sans les détails complets)
   * @param {string} filePath - Chemin du fichier DTSX
   * @param {string} fileContent - Contenu du fichier DTSX
   * @returns {Object|null} - Informations de base du package
   */
  async extractBasicDtsxInfo(filePath, fileContent) {
    try {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(fileContent);
      
      const dtsxPackage = result['DTS:Executable'];
      if (!dtsxPackage || !dtsxPackage[0]) {
        return null;
      }

      const packageInfo = dtsxPackage[0];
      
      return {
        package_name: this.extractPropertyValue(packageInfo, 'ObjectName') || path.basename(filePath, '.dtsx'),
        description: this.extractPropertyValue(packageInfo, 'Description') || '',
        creation_date: this.extractPropertyValue(packageInfo, 'CreationDate') || '',
        creator: this.extractPropertyValue(packageInfo, 'CreatorName') || '',
        version: this.extractPropertyValue(packageInfo, 'VersionBuild') || '',
        guid: packageInfo.$['DTS:DTSID'] || '',
        // Ne pas charger les détails complets ici
        executables_count: 0, // Sera calculé à la demande
        variables_count: 0,   // Sera calculé à la demande
        connections_count: 0  // Sera calculé à la demande
      };
    } catch (error) {
      console.error('Erreur lors de l\'extraction des informations de base DTSX:', error);
      return null;
    }
  }

  /**
   * Extrait le numéro de version d'un nom de fichier DTSX
   * @param {string} filename - Nom du fichier DTSX
   * @returns {number|null} - Numéro de version ou null si non trouvé
   */
  extractVersionNumber(filename) {
    const match = filename.match(/\((\d+)\)\.dtsx$/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Obtient la liste des serveurs disponibles
   */
  async getServers() {
    try {
      const items = await fs.readdir(this.dtsxRootPath);
      return items.filter(item => {
        const itemPath = path.join(this.dtsxRootPath, item);
        return fs.stat(itemPath).then(stat => stat.isDirectory());
      });
    } catch (error) {
      // Erreur silencieuse
      return [];
    }
  }

  /**
   * Obtient la liste des fichiers DTSX dans un répertoire
   */
  async getDtsxFiles(directoryPath) {
    try {
      const items = await fs.readdir(directoryPath);
      return items.filter(item => item.toLowerCase().endsWith('.dtsx'));
    } catch (error) {
      // Erreur silencieuse
      return [];
    }
  }

  /**
   * Parse un fichier DTSX et extrait les informations importantes
   */
  async parseDtsxFile(filePath, content) {
    try {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(content);
      
      const dtsxPackage = result['DTS:Executable'];
      if (!dtsxPackage) {
        return null;
      }

      const packageAttrs = dtsxPackage.$;
      
      const variables = this.extractVariables(dtsxPackage);
      const package_parameters = this.extractPackageParameters(dtsxPackage);
      const connection_managers = this.extractConnectionManagers(dtsxPackage);
      const executables = this.extractExecutables(dtsxPackage, connection_managers);
      const precedenceConstraints = this.extractPrecedenceConstraints(dtsxPackage);
      
      // Trier les exécutables selon l'ordre d'exécution basé sur les contraintes de précédence
      const orderedExecutables = this.orderExecutablesByPrecedence(executables, precedenceConstraints);
      
      return {
        object_name: packageAttrs.DTSObjectName || path.basename(filePath, '.dtsx'),
        object_type: 'DTSX_PACKAGE',
        description: packageAttrs.DTSDescription || '',
        creation_date: packageAttrs.DTSCreationDate,
        creator_name: packageAttrs.DTSCreatorName,
        creator_computer: packageAttrs.DTSCreatorComputerName,
        version_guid: packageAttrs.DTSVersionGUID,
        package_type: packageAttrs.DTSPackageType,
        connection_managers: connection_managers,
        variables: variables,
        package_parameters: package_parameters,
        executables: orderedExecutables
      };
    } catch (error) {
      console.error('Erreur lors du parsing DTSX:', error);
      return null;
    }
  }

  /**
   * Extrait les gestionnaires de connexion
   */
  extractConnectionManagers(dtsxPackage) {
    try {
      const results = [];

      // Format nouveau - DTS:ConnectionManagers
      const connectionManagers = dtsxPackage['DTS:ConnectionManagers'];
      if (connectionManagers && connectionManagers[0] && connectionManagers[0]['DTS:ConnectionManager']) {
        const cmArray = Array.isArray(connectionManagers[0]['DTS:ConnectionManager']) 
          ? connectionManagers[0]['DTS:ConnectionManager'] 
          : [connectionManagers[0]['DTS:ConnectionManager']];
        
        cmArray.forEach(cm => {
          if (cm.$ && cm.$['DTS:ObjectName']) {
            const connection = {
              name: cm.$['DTS:ObjectName'],
              type: cm.$['DTS:CreationName'] || 'Unknown',
              guid: cm.$['DTS:DTSID'] || '',
              connection_string: this.extractConnectionString(cm)
            };
            console.log('Connexion extraite:', connection);
            results.push(connection);
          }
        });
      }

      // Format ancien - recherche dans tout le document
      const oldConnections = this.findOldConnections(dtsxPackage);
      results.push(...oldConnections);

      return results;
    } catch (error) {
      console.error('Erreur lors de l\'extraction des connexions:', error);
      return [];
    }
  }

  /**
   * Trouve les connexions dans l'ancien format
   */
  findOldConnections(dtsxPackage) {
    try {
      const results = [];
      
      // Recherche récursive des DTS:ConnectionManager
      const findConnections = (element) => {
        if (element['DTS:ConnectionManager']) {
          const connections = Array.isArray(element['DTS:ConnectionManager']) 
            ? element['DTS:ConnectionManager'] 
            : [element['DTS:ConnectionManager']];
          
          connections.forEach(conn => {
            const props = {};
            
            // Extraire les propriétés
            if (conn['DTS:Property']) {
              const properties = Array.isArray(conn['DTS:Property']) 
                ? conn['DTS:Property'] 
                : [conn['DTS:Property']];
              
              properties.forEach(prop => {
                if (prop.$ && prop.$['DTS:Name']) {
                  props[prop.$['DTS:Name']] = prop._ || prop.text || '';
                }
              });
            }
            
            const name = props['ObjectName'] || conn.$?.DTSObjectName;
            const type = props['CreationName'] || conn.$?.DTSCreationName;
            
            if (name && name !== 'None') {
              results.push({
                name: name,
                type: type || 'Unknown',
                connection_string: this.extractConnectionString(conn)
              });
            }
          });
        }
        
        // Recherche récursive dans les enfants
        Object.values(element).forEach(child => {
          if (typeof child === 'object' && child !== null) {
            if (Array.isArray(child)) {
              child.forEach(item => findConnections(item));
            } else {
              findConnections(child);
            }
          }
        });
      };
      
      findConnections(dtsxPackage);
      return results;
    } catch (error) {
      console.error('Erreur lors de la recherche des connexions:', error);
      return [];
    }
  }

  /**
   * Extrait la chaîne de connexion d'un gestionnaire de connexion
   */
  extractConnectionString(connectionManager) {
    try {
      const objectData = connectionManager['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const connectionManagerData = objectData[0]['DTS:ConnectionManager'];
      if (!connectionManagerData || !connectionManagerData[0]) return '';

      return connectionManagerData[0].$.DTSConnectionString || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Extrait les variables
   */
  extractVariables(dtsxPackage) {
    try {
      const results = [];

      // Variables dans DTS:Variables
      const variables = dtsxPackage['DTS:Variables'];
      
      if (variables && variables[0] && variables[0]['DTS:Variable']) {
        const variablesArray = Array.isArray(variables[0]['DTS:Variable']) 
          ? variables[0]['DTS:Variable'] 
          : [variables[0]['DTS:Variable']];
        
        variablesArray.forEach((variable, index) => {
          if (variable.$ && variable.$['DTS:ObjectName']) {
            const varData = {
              name: variable.$['DTS:ObjectName'],
              namespace: variable.$['DTS:Namespace'] || 'User',
              value: this.extractVariableValue(variable),
              expression: variable.$['DTS:Expression'] || null,
              evaluateAsExpression: variable.$['DTS:EvaluateAsExpression'] === 'True'
            };
            
            results.push(varData);
          }
        });
      }
      return results;
    } catch (error) {
      console.error('Erreur lors de l\'extraction des variables:', error);
      return [];
    }
  }

  /**
   * Extrait les paramètres du package
   */
  extractPackageParameters(dtsxPackage) {
    try {
      const results = [];

      // Paramètres dans DTS:PackageParameters
      const packageParameters = dtsxPackage['DTS:PackageParameters'];
      if (packageParameters && packageParameters[0] && packageParameters[0]['DTS:PackageParameter']) {
        const paramsArray = Array.isArray(packageParameters[0]['DTS:PackageParameter']) 
          ? packageParameters[0]['DTS:PackageParameter'] 
          : [packageParameters[0]['DTS:PackageParameter']];
        
        paramsArray.forEach(param => {
          if (param.$ && param.$['DTS:ObjectName']) {
            results.push({
              name: param.$['DTS:ObjectName'],
              namespace: 'Package',
              value: this.extractParameterValue(param),
              dataType: param.$['DTS:DataType'] || 'Unknown'
            });
          }
        });
      }

      return results;
    } catch (error) {
      console.error('Erreur lors de l\'extraction des paramètres:', error);
      return [];
    }
  }

  /**
   * Extrait la valeur d'un paramètre
   */
  extractParameterValue(param) {
    try {
      const properties = param['DTS:Property'];
      if (!properties) return '';

      const propertiesArray = Array.isArray(properties) ? properties : [properties];
      
      const parameterValueProp = propertiesArray.find(prop => 
        prop.$ && prop.$['DTS:Name'] === 'ParameterValue'
      );
      
      if (parameterValueProp) {
        return parameterValueProp._ || parameterValueProp.text || '';
      }
      
      return '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Extrait la valeur d'une variable
   */
  extractVariableValue(variable) {
    try {
      const variableValue = variable['DTS:VariableValue'];
      
      if (!variableValue || !variableValue[0]) {
        return '';
      }

      const value = variableValue[0]._ || variableValue[0] || '';
      return value;
    } catch (error) {
      return '';
    }
  }

  /**
   * Extrait les exécutables (tâches)
   */
  extractExecutables(dtsxPackage, connectionManagers) {
    try {
      // Les exécutables sont dans DTS:Executables > DTS:Executable
      const executablesContainer = dtsxPackage['DTS:Executables'];
      if (!executablesContainer || !executablesContainer[0]) {
        return [];
      }

      const executables = executablesContainer[0]['DTS:Executable'];
      if (!executables) {
        return [];
      }

      // Extraire toutes les tâches
      const allTasks = this.extractExecutableRecursive(executables, connectionManagers);
      
      // Extraire les contraintes de précédence
      const precedenceConstraints = this.extractPrecedenceConstraints(dtsxPackage);
      
      // Calculer l'ordre d'exécution basé sur les contraintes
      const tasksWithOrder = this.calculateExecutionOrder(allTasks, precedenceConstraints);
      
      // Retourner toutes les tâches avec leur ordre d'exécution
      // Les tâches désactivées sont marquées mais conservées pour l'affichage
      return tasksWithOrder;
    } catch (error) {
      console.error('Erreur lors de l\'extraction des exécutables:', error);
      return [];
    }
  }

  /**
   * Calcule l'ordre d'exécution basé sur les contraintes de précédence
   */
  calculateExecutionOrder(tasks, precedenceConstraints) {
    try {
      console.log('=== CALCUL ORDRE D\'EXÉCUTION ===');
      console.log('Tâches:', tasks.map(t => t.name));
      console.log('Contraintes:', precedenceConstraints);
      
      // Créer un mapping des tâches par nom pour faciliter la recherche
      const taskMap = new Map();
      tasks.forEach(task => {
        taskMap.set(task.name, task);
      });

      // Créer un graphe de dépendances
      const dependencies = new Map();
      const inDegree = new Map();
      
      // Initialiser les degrés d'entrée
      tasks.forEach(task => {
        inDegree.set(task.name, 0);
        dependencies.set(task.name, []);
      });

      // Construire le graphe de dépendances à partir des contraintes
      precedenceConstraints.forEach(constraint => {
        const fromTask = constraint.fromExecutable;
        const toTask = constraint.toExecutable;
        
        console.log(`Contrainte: ${fromTask} -> ${toTask}`);
        console.log(`FromTask existe: ${taskMap.has(fromTask)}, ToTask existe: ${taskMap.has(toTask)}`);
        
        // Ne traiter que les contraintes où les deux tâches existent
        if (taskMap.has(fromTask) && taskMap.has(toTask)) {
          dependencies.get(fromTask).push(toTask);
          inDegree.set(toTask, inDegree.get(toTask) + 1);
          console.log(`Dépendance ajoutée: ${fromTask} -> ${toTask}`);
        } else {
          console.log(`Contrainte ignorée - tâche manquante: ${fromTask} ou ${toTask}`);
        }
      });

      console.log('Degrés d\'entrée:', Object.fromEntries(inDegree));
      console.log('Dépendances:', Object.fromEntries(dependencies));
      
      // Vérifier spécifiquement "remplir la table article livre LF"
      const targetTask = 'remplir la table article livre LF';
      console.log(`Vérification de "${targetTask}":`);
      console.log(`- Existe dans taskMap: ${taskMap.has(targetTask)}`);
      console.log(`- Degré d'entrée: ${inDegree.get(targetTask) || 0}`);
      console.log(`- Dépendances sortantes: ${dependencies.get(targetTask) || []}`);

      // Tri topologique pour déterminer l'ordre d'exécution
      const queue = [];
      const executionOrder = [];
      
      // Ajouter les tâches sans dépendances (degré d'entrée = 0)
      tasks.forEach(task => {
        if (inDegree.get(task.name) === 0) {
          queue.push(task.name);
        }
      });

      console.log('Tâches sans dépendances:', queue);

      // Traiter les tâches dans l'ordre
      while (queue.length > 0) {
        const currentTask = queue.shift();
        executionOrder.push(currentTask);
        
        console.log(`Traitement: ${currentTask}`);
        
        // Réduire le degré d'entrée des tâches dépendantes
        dependencies.get(currentTask).forEach(dependentTask => {
          inDegree.set(dependentTask, inDegree.get(dependentTask) - 1);
          console.log(`Réduction degré ${dependentTask}: ${inDegree.get(dependentTask) + 1} -> ${inDegree.get(dependentTask)}`);
          if (inDegree.get(dependentTask) === 0) {
            queue.push(dependentTask);
            console.log(`Ajout à la queue: ${dependentTask}`);
          }
        });
      }

      // Ajouter les tâches restantes (sans contraintes de précédence)
      // Les trier par degré d'entrée décroissant pour que les tâches avec plus de dépendances soient en dernier
      const remainingTasks = tasks.filter(task => !executionOrder.includes(task.name));
      
      console.log('Tâches restantes non traitées:', remainingTasks.map(t => t.name));
      console.log('Leurs degrés d\'entrée:', remainingTasks.map(t => ({ name: t.name, degree: inDegree.get(t.name) || 0 })));
      
      remainingTasks.sort((a, b) => {
        const degreeA = inDegree.get(a.name) || 0;
        const degreeB = inDegree.get(b.name) || 0;
        console.log(`Tri: ${a.name} (degré ${degreeA}) vs ${b.name} (degré ${degreeB})`);
        return degreeB - degreeA; // Ordre décroissant
      });
      
      remainingTasks.forEach(task => {
        executionOrder.push(task.name);
        console.log(`Tâche ajoutée à la fin (degré ${inDegree.get(task.name) || 0}): ${task.name}`);
      });

      console.log('Ordre d\'exécution final:', executionOrder);

      // Assigner l'ordre d'exécution aux tâches
      const orderedTasks = [];
      executionOrder.forEach((taskName, index) => {
        const task = taskMap.get(taskName);
        if (task) {
          task.executionOrder = index;
          orderedTasks.push(task);
        }
      });

      return orderedTasks;
    } catch (error) {
      console.error('Erreur lors du calcul de l\'ordre d\'exécution:', error);
      // En cas d'erreur, retourner les tâches avec l'ordre d'apparition dans le XML
      return tasks.map((task, index) => ({ ...task, executionOrder: index }));
    }
  }

  /**
   * Extrait récursivement les exécutables
   */
  extractExecutableRecursive(executables, connectionManagers) {
    if (!executables) return [];

    // S'assurer que executables est un tableau
    const executablesArray = Array.isArray(executables) ? executables : [executables];

    const results = [];

    for (let index = 0; index < executablesArray.length; index++) {
      const executable = executablesArray[index];
      
      // Vérifier si l'exécutable est désactivé
      const isDisabled = executable.$['DTS:Disabled'] === 'True';

      const objectName = executable.$['DTS:ObjectName'] || this.extractPropertyValue(executable, 'ObjectName');
      const description = executable.$['DTS:Description'] || this.extractPropertyValue(executable, 'Description');
      const creationName = executable.$['DTS:CreationName'] || this.extractPropertyValue(executable, 'CreationName');
      const type = executable.$['DTS:ExecutableType'] || 'Unknown';

      const result = {
        name: objectName || 'Tâche sans nom',
        type: type,
        description: description || '',
        creationName: creationName || '',
        guid: executable.$['DTS:DTSID'] || '',
        executionOrder: 0, // Sera calculé plus tard basé sur les contraintes de précédence
        disabled: isDisabled // Ajouter le statut désactivé
      };

      // Extraire les détails spécifiques selon le type de tâche
      if (creationName && creationName.includes('ScriptTask')) {
        result.ScriptCode = this.extractScriptTaskCode(executable);
        result.Language = this.extractScriptTaskLanguage(executable);
      } else if (creationName && (creationName.includes('ExecuteSQLTask') || creationName.includes('SQLTask'))) {
        result.SqlStatementSource = this.extractSqlTaskQuery(executable);
        result.Connection = this.extractSqlTaskConnection(executable, connectionManagers);
      } else if (creationName && creationName.includes('FileSystemTask')) {
        result.Operation = this.extractFileSystemTaskOperation(executable);
        result.Source = this.extractFileSystemTaskSource(executable, connectionManagers);
        result.Destination = this.extractFileSystemTaskDestination(executable, connectionManagers);
      } else if ((creationName && creationName.includes('DataFlowTask')) || 
                 (type && type.includes('{5918251B-2970-45A4-AB5F-01C3C588FE5A}'))) {
        result.Connection = this.extractDataFlowTaskConnection(executable, connectionManagers);
      } else if (creationName && creationName.includes('FTPTask')) {
        result.Connection = this.extractFtpTaskConnection(executable, connectionManagers);
      } else if (creationName && creationName.includes('WebServiceTask')) {
        result.Connection = this.extractWebServiceTaskConnection(executable, connectionManagers);
      } else if (creationName && creationName.includes('SendMailTask')) {
        result.Connection = this.extractSendMailTaskConnection(executable, connectionManagers);
      }

      // Récursion pour les conteneurs
      if (executable['DTS:Executables']) {
        const childExecutables = executable['DTS:Executables'][0]['DTS:Executable'];
        result.children = this.extractExecutableRecursive(childExecutables, connectionManagers);
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Extrait la valeur d'une propriété DTS
   */
  extractPropertyValue(executable, propertyName) {
    try {
      const properties = executable['DTS:Property'];
      if (!properties) return '';

      // Les propriétés peuvent être un tableau ou un objet unique
      const propertiesArray = Array.isArray(properties) ? properties : [properties];
      
      const property = propertiesArray.find(prop => prop.$['DTS:Name'] === propertyName);
      if (!property) return '';
      
      // La valeur est dans property._ (contenu textuel de l'élément)
      return property._ || '';
    } catch (error) {
      console.error('Erreur extractPropertyValue:', error);
      return '';
    }
  }

  /**
   * Extrait le code source d'une Script Task
   */
  extractScriptTaskCode(executable) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const scriptProject = objectData[0]['ScriptProject'];
      if (!scriptProject || !scriptProject[0]) return '';

      const projectItems = scriptProject[0]['ProjectItem'];
      if (!projectItems) return '';

      // Chercher le fichier Main.cs ou Main.vb
      const mainFile = Array.isArray(projectItems) 
        ? projectItems.find(item => item.$.Name && item.$.Name.includes('Main.'))
        : projectItems;

      if (mainFile && mainFile._) {
        const fullCode = mainFile._;
        return this.extractMainFunction(fullCode);
      }

      return '';
    } catch (error) {
      console.error('Erreur extractScriptTaskCode:', error);
      return '';
    }
  }

  /**
   * Extrait la fonction Main du code source (inspiré du script Python)
   */
  extractMainFunction(codeText) {
    if (!codeText) return '';

    try {
      // Patterns pour C#
      const csharpPatterns = [
        /public void Main\(\)\s*\{[\s\S]*?\n\s*\}\s*$/m,  // Pattern avec accolades
        /public void Main\(\)\s*\{[\s\S]*?\n\s*Dts\.TaskResult[\s\S]*?\n\s*\}\s*$/m,  // Pattern avec TaskResult
      ];

      // Patterns pour VB
      const vbPatterns = [
        /Public Sub Main\(\)\s*\n[\s\S]*?\nEnd Sub/m,  // Pattern VB
      ];

      // Essayer les patterns C#
      for (const pattern of csharpPatterns) {
        const match = codeText.match(pattern);
        if (match) {
          return match[0];
        }
      }

      // Essayer les patterns VB
      for (const pattern of vbPatterns) {
        const match = codeText.match(pattern);
        if (match) {
          return match[0];
        }
      }

      // Si pas de pattern trouvé, chercher manuellement la fonction Main
      if (codeText.includes('public void Main()')) {
        const start = codeText.indexOf('public void Main()');
        let braceCount = 0;
        let inFunction = false;
        let endPos = start;

        for (let i = start; i < codeText.length; i++) {
          const char = codeText[i];
          if (char === '{') {
            if (!inFunction) {
              inFunction = true;
            }
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (inFunction && braceCount === 0) {
              endPos = i + 1;
              break;
            }
          }
        }

        if (endPos > start) {
          return codeText.substring(start, endPos);
        }
      }

      // Si pas de fonction Main trouvée, retourner le début du code (limité)
      return codeText.length > 1000 ? codeText.substring(0, 1000) + '...' : codeText;
    } catch (error) {
      console.error('Erreur extractMainFunction:', error);
      return codeText;
    }
  }

  /**
   * Extrait le langage d'une Script Task
   */
  extractScriptTaskLanguage(executable) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const scriptProject = objectData[0]['ScriptProject'];
      if (!scriptProject || !scriptProject[0]) return '';

      return scriptProject[0].$.Language || 'C#';
    } catch (error) {
      console.error('Erreur extractScriptTaskLanguage:', error);
      return 'C#';
    }
  }

  /**
   * Extrait la requête SQL d'une SQL Task
   */
  extractSqlTaskQuery(executable) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const sqlTaskData = objectData[0]['SQLTask:SqlTaskData'];
      if (!sqlTaskData || !sqlTaskData[0]) return '';

      return sqlTaskData[0].$['SQLTask:SqlStatementSource'] || '';
    } catch (error) {
      console.error('Erreur extractSqlTaskQuery:', error);
      return '';
    }
  }

  /**
   * Extrait la connexion d'une SQL Task
   */
  extractSqlTaskConnection(executable, connectionManagers) {
    try {
      console.log('extractSqlTaskConnection appelée');
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const sqlTaskData = objectData[0]['SQLTask:SqlTaskData'];
      if (!sqlTaskData || !sqlTaskData[0]) return '';

      const connectionRef = sqlTaskData[0].$['SQLTask:Connection'] || '';
      console.log('ConnectionRef trouvé:', connectionRef);
      
      // Si c'est un GUID, essayer de le résoudre vers le nom de la connexion
      if (connectionRef && this.isGuid(connectionRef)) {
        console.log('C\'est un GUID, résolution...');
        return this.resolveConnectionNameFromList(connectionRef, connectionManagers);
      }
      
      console.log('Pas un GUID ou pas de connexion, retour:', connectionRef);
      return connectionRef;
    } catch (error) {
      console.error('Erreur extractSqlTaskConnection:', error);
      return '';
    }
  }

  /**
   * Vérifie si une chaîne est un GUID
   */
  isGuid(str) {
    // GUID avec ou sans accolades
    const guidRegex = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
    return guidRegex.test(str);
  }

  /**
   * Résout le nom de la connexion à partir du GUID en utilisant la liste des connexions
   */
  resolveConnectionNameFromList(connectionGuid, connectionManagers) {
    try {
      console.log('Résolution connexion:', connectionGuid);
      console.log('Connexions disponibles:', connectionManagers.map(c => ({ name: c.name, guid: c.guid })));
      
      // Chercher dans la liste des connexions déjà extraites
      for (const connection of connectionManagers) {
        console.log('Comparaison:', connection.guid, '===', connectionGuid, '?', connection.guid === connectionGuid);
        // Essayer de trouver par GUID (si disponible) ou par nom
        if (connection.guid === connectionGuid || connection.name === connectionGuid) {
          console.log('Connexion trouvée:', connection.name);
          return connection.name;
        }
      }

      console.log('Connexion non trouvée, retour du GUID');
      return connectionGuid; // Retourner le GUID si pas trouvé
    } catch (error) {
      console.error('Erreur resolveConnectionNameFromList:', error);
      return connectionGuid;
    }
  }

  /**
   * Extrait l'opération d'une File System Task
   */
  extractFileSystemTaskOperation(executable) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const fileSystemData = objectData[0]['FileSystemData'];
      if (!fileSystemData || !fileSystemData[0]) return '';

      return fileSystemData[0].$.TaskOperationType || '';
    } catch (error) {
      console.error('Erreur extractFileSystemTaskOperation:', error);
      return '';
    }
  }

  /**
   * Extrait la source d'une File System Task
   */
  extractFileSystemTaskSource(executable, connectionManagers) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const fileSystemData = objectData[0]['FileSystemData'];
      if (!fileSystemData || !fileSystemData[0]) return '';

      const sourcePath = fileSystemData[0].$['TaskSourcePath'] || '';
      
      // Si c'est un GUID, essayer de le résoudre vers le nom de la connexion
      if (sourcePath && this.isGuid(sourcePath)) {
        const sourceConnection = this.resolveConnectionNameFromList(sourcePath, connectionManagers);
        if (sourceConnection !== sourcePath) {
          return sourceConnection;
        }
      }
      
      return sourcePath;
    } catch (error) {
      console.error('Erreur extractFileSystemTaskSource:', error);
      return '';
    }
  }

  /**
   * Extrait la destination d'une File System Task
   */
  extractFileSystemTaskDestination(executable, connectionManagers) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const fileSystemData = objectData[0]['FileSystemData'];
      if (!fileSystemData || !fileSystemData[0]) return '';

      const destPath = fileSystemData[0].$['TaskDestinationPath'] || '';
      
      // Si c'est un GUID, essayer de le résoudre vers le nom de la connexion
      if (destPath && this.isGuid(destPath)) {
        const destConnection = this.resolveConnectionNameFromList(destPath, connectionManagers);
        if (destConnection !== destPath) {
          return destConnection;
        }
      }
      
      return destPath;
    } catch (error) {
      console.error('Erreur extractFileSystemTaskDestination:', error);
      return '';
    }
  }

  /**
   * Extrait la connexion d'une File System Task
   */
  extractFileSystemTaskConnection(executable, connectionManagers) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const fileSystemData = objectData[0]['FileSystemData'];
      if (!fileSystemData || !fileSystemData[0]) return '';

      // Les File System Tasks utilisent TaskSourcePath et TaskDestinationPath
      // qui peuvent contenir des GUIDs de connexions
      const sourcePath = fileSystemData[0].$['TaskSourcePath'] || '';
      const destPath = fileSystemData[0].$['TaskDestinationPath'] || '';
      
      // Vérifier si les chemins sont des GUIDs de connexions
      if (sourcePath && this.isGuid(sourcePath)) {
        const sourceConnection = this.resolveConnectionNameFromList(sourcePath, connectionManagers);
        if (sourceConnection !== sourcePath) {
          return sourceConnection;
        }
      }
      
      return '';
    } catch (error) {
      console.error('Erreur extractFileSystemTaskConnection:', error);
      return '';
    }
  }

  /**
   * Extrait les contraintes de précédence
   */
  extractPrecedenceConstraints(dtsxPackage) {
    try {
      const constraints = [];
      const precedenceConstraints = dtsxPackage['DTS:PrecedenceConstraints'];
      
      if (precedenceConstraints && precedenceConstraints[0] && precedenceConstraints[0]['DTS:PrecedenceConstraint']) {
        const pcArray = Array.isArray(precedenceConstraints[0]['DTS:PrecedenceConstraint']) 
          ? precedenceConstraints[0]['DTS:PrecedenceConstraint'] 
          : [precedenceConstraints[0]['DTS:PrecedenceConstraint']];
        
        pcArray.forEach(constraint => {
          if (constraint.$) {
            // Les contraintes utilisent DTS:From et DTS:To avec les noms des exécutables
            const fromExecutable = constraint.$['DTS:From'] || '';
            const toExecutable = constraint.$['DTS:To'] || '';
            
            // Extraire le nom de l'exécutable (enlever "Package\")
            const fromName = fromExecutable.replace(/^Package\\/, '');
            const toName = toExecutable.replace(/^Package\\/, '');
            
            console.log(`Contrainte extraite: ${fromName} -> ${toName}`);
            
            constraints.push({
              name: constraint.$['DTS:ObjectName'] || '',
              fromExecutable: fromName,
              toExecutable: toName,
              value: constraint.$['DTS:Value'] || '',
              expression: constraint.$['DTS:Expression'] || ''
            });
          }
        });
      }
      
      return constraints;
    } catch (error) {
      console.error('Erreur extractPrecedenceConstraints:', error);
      return [];
    }
  }

  /**
   * Trie les exécutables selon l'ordre d'exécution basé sur les contraintes de précédence
   */
  orderExecutablesByPrecedence(executables, precedenceConstraints) {
    try {
      console.log('Tri des exécutables - Nombre de contraintes:', precedenceConstraints?.length);
      console.log('Contraintes:', precedenceConstraints);
      console.log('Exécutables avant tri:', executables.map(e => ({ name: e.name, order: e.executionOrder })));
      
      // Si pas de contraintes, retourner l'ordre d'apparition dans le XML
      if (!precedenceConstraints || precedenceConstraints.length === 0) {
        console.log('Pas de contraintes, ordre d\'apparition dans XML conservé');
        return executables.sort((a, b) => a.executionOrder - b.executionOrder);
      }

      // Créer un graphe de dépendances
      const dependencies = new Map();
      const inDegree = new Map();
      
      // Initialiser les degrés d'entrée
      executables.forEach(exec => {
        inDegree.set(exec.name, 0);
        dependencies.set(exec.name, []);
      });

      // Construire le graphe de dépendances
      precedenceConstraints.forEach(constraint => {
        console.log('Traitement contrainte:', constraint);
        if (constraint.fromExecutable && constraint.toExecutable) {
          const from = this.findExecutableByName(executables, constraint.fromExecutable);
          const to = this.findExecutableByName(executables, constraint.toExecutable);
          
          console.log('From trouvé:', from?.name, 'To trouvé:', to?.name);
          
          if (from && to) {
            dependencies.get(from.name).push(to.name);
            inDegree.set(to.name, inDegree.get(to.name) + 1);
            console.log('Dépendance ajoutée:', from.name, '->', to.name);
          }
        }
      });

      // Tri topologique
      const queue = [];
      const result = [];
      
      // Ajouter les tâches sans dépendances
      executables.forEach(exec => {
        if (inDegree.get(exec.name) === 0) {
          queue.push(exec);
        }
      });

      // Traiter la queue
      while (queue.length > 0) {
        const current = queue.shift();
        result.push(current);
        
        dependencies.get(current.name).forEach(dep => {
          inDegree.set(dep, inDegree.get(dep) - 1);
          if (inDegree.get(dep) === 0) {
            const depExec = this.findExecutableByName(executables, dep);
            if (depExec) {
              queue.push(depExec);
            }
          }
        });
      }

      // Ajouter les tâches restantes (sans contraintes)
      executables.forEach(exec => {
        if (!result.find(r => r.name === exec.name)) {
          result.push(exec);
        }
      });

      console.log('Exécutables après tri topologique:', result.map(e => e.name));
      return result;
    } catch (error) {
      console.error('Erreur orderExecutablesByPrecedence:', error);
      return executables.sort((a, b) => a.executionOrder - b.executionOrder); // Retourner l'ordre XML en cas d'erreur
    }
  }

  /**
   * Trouve un exécutable par son nom
   */
  findExecutableByName(executables, name) {
    return executables.find(exec => exec.name === name);
  }

  /**
   * Trouve un exécutable par son GUID
   */
  findExecutableByGuid(executables, guid) {
    return executables.find(exec => exec.guid === guid);
  }

  /**
   * Extrait la connexion d'une Data Flow Task
   */
  extractDataFlowTaskConnection(executable, connectionManagers) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const dataFlowData = objectData[0]['DataFlow:DataFlow'];
      if (!dataFlowData || !dataFlowData[0]) return '';

      const connectionRef = dataFlowData[0].$['DataFlow:Connection'] || '';
      
      // Si c'est un GUID, essayer de le résoudre vers le nom de la connexion
      if (connectionRef && this.isGuid(connectionRef)) {
        return this.resolveConnectionNameFromList(connectionRef, connectionManagers);
      }
      
      return connectionRef;
    } catch (error) {
      console.error('Erreur extractDataFlowTaskConnection:', error);
      return '';
    }
  }

  /**
   * Extrait la connexion d'une FTP Task
   */
  extractFtpTaskConnection(executable, connectionManagers) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const ftpTaskData = objectData[0]['FTPTask:FtpTaskData'];
      if (!ftpTaskData || !ftpTaskData[0]) return '';

      const connectionRef = ftpTaskData[0].$['FTPTask:Connection'] || '';
      
      // Si c'est un GUID, essayer de le résoudre vers le nom de la connexion
      if (connectionRef && this.isGuid(connectionRef)) {
        return this.resolveConnectionNameFromList(connectionRef, connectionManagers);
      }
      
      return connectionRef;
    } catch (error) {
      console.error('Erreur extractFtpTaskConnection:', error);
      return '';
    }
  }

  /**
   * Extrait la connexion d'une Web Service Task
   */
  extractWebServiceTaskConnection(executable, connectionManagers) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const webServiceTaskData = objectData[0]['WebServiceTask:WebServiceTaskData'];
      if (!webServiceTaskData || !webServiceTaskData[0]) return '';

      const connectionRef = webServiceTaskData[0].$['WebServiceTask:Connection'] || '';
      
      // Si c'est un GUID, essayer de le résoudre vers le nom de la connexion
      if (connectionRef && this.isGuid(connectionRef)) {
        return this.resolveConnectionNameFromList(connectionRef, connectionManagers);
      }
      
      return connectionRef;
    } catch (error) {
      console.error('Erreur extractWebServiceTaskConnection:', error);
      return '';
    }
  }

  /**
   * Extrait la connexion d'une Send Mail Task
   */
  extractSendMailTaskConnection(executable, connectionManagers) {
    try {
      const objectData = executable['DTS:ObjectData'];
      if (!objectData || !objectData[0]) return '';

      const sendMailTaskData = objectData[0]['SendMailTask:SendMailTaskData'];
      if (!sendMailTaskData || !sendMailTaskData[0]) return '';

      const connectionRef = sendMailTaskData[0].$['SendMailTask:Connection'] || '';
      
      // Si c'est un GUID, essayer de le résoudre vers le nom de la connexion
      if (connectionRef && this.isGuid(connectionRef)) {
        return this.resolveConnectionNameFromList(connectionRef, connectionManagers);
      }
      
      return connectionRef;
    } catch (error) {
      console.error('Erreur extractSendMailTaskConnection:', error);
      return '';
    }
  }

  /**
   * Trouve les correspondances dans le contenu
   */
  findMatches(content, searchTerm) {
    const matches = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(searchTerm)) {
        matches.push({
          line: index + 1,
          content: line.trim().substring(0, 200) + (line.length > 200 ? '...' : '')
        });
      }
    });

    return matches.slice(0, 5); // Limiter à 5 correspondances
  }

  /**
   * Recherche un DTSX spécifique par nom
   */
  async findDtsxByName(dtsxName) {
    const searchTerm = dtsxName.replace(/\.dtsx$/i, '');
    const results = await this.searchInDtsxFiles(searchTerm);
    
    return results.filter(result => 
      result.object_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  /**
   * Obtient les informations détaillées d'un fichier DTSX
   */
  async getDtsxDetails(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return await this.parseDtsxFile(filePath, content);
    } catch (error) {
      // Erreur silencieuse
      return null;
    }
  }
}

module.exports = DtsxSearcher;
