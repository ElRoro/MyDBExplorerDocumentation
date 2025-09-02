import xml.etree.ElementTree as ET
import re

def parse_dtsx(file_path):
    tree = ET.parse(file_path)
    root = tree.getroot()

    ns = {'DTS': 'www.microsoft.com/SqlServer/Dts'}
    dts_ns = "{www.microsoft.com/SqlServer/Dts}"

    results = {
        "PackageInfo": {},
        "Connections": [],
        "Variables": [],
        "Executables": [],
        "PrecedenceConstraints": [],
        "DataFlowComponents": [],
        "SQLQueries": []
    }

    # Informations du package - gérer les deux formats
    package_props = {}
    
    # Format ancien avec DTS:Property
    for prop in root.findall(".//DTS:Property", ns):
        name = prop.get(dts_ns + "Name")
        if name in ["ObjectName", "Description", "CreationDate", "VersionMajor", "VersionMinor", "VersionBuild"]:
            package_props[name] = prop.text or ""
    
    # Format nouveau avec attributs
    if not package_props.get("ObjectName"):
        package_props["ObjectName"] = root.get(dts_ns + "ObjectName", "")
        package_props["Description"] = root.get(dts_ns + "Description", "")
        package_props["CreationDate"] = root.get(dts_ns + "CreationDate", "")
        package_props["VersionBuild"] = root.get(dts_ns + "VersionBuild", "")
    
    results["PackageInfo"] = package_props

    # Connexions - gérer les deux formats
    for conn in root.findall(".//DTS:ConnectionManager", ns):
        # Format ancien
        props = {p.get(dts_ns + "Name"): (p.text or "") for p in conn.findall("DTS:Property", ns)}
        name = props.get("ObjectName") or conn.get(dts_ns + "ObjectName", "")
        conn_type = props.get("CreationName") or conn.get(dts_ns + "CreationName", "")
        
        # Extraire la chaîne de connexion
        connection_string = ""
        object_data = conn.find("DTS:ObjectData", ns)
        if object_data is not None:
            inner_conn = object_data.find("DTS:ConnectionManager", ns)
            if inner_conn is not None:
                # Format ancien
                for prop in inner_conn.findall("DTS:Property", ns):
                    if prop.get(dts_ns + "Name") == "ConnectionString":
                        connection_string = prop.text or ""
                        break
                # Format nouveau
                if not connection_string:
                    connection_string = inner_conn.get(dts_ns + "ConnectionString", "")
        
        if name and name != 'None':
            results["Connections"].append({
                "Name": name, 
                "Type": conn_type,
                "ConnectionString": connection_string
            })

    # Variables - gérer les deux formats
    # Format ancien
    for var in root.findall(".//DTS:PackageVariable", ns):
        props = {p.get(dts_ns + "Name"): (p.text or "") for p in var.findall("DTS:Property", ns)}
        name = props.get("ObjectName")
        value = props.get("PackageVariableValue")
        namespace = props.get("Namespace")
        if name and name != 'None':
            results["Variables"].append({
                "Name": name, 
                "Value": value,
                "Namespace": namespace
            })
    
    # Format nouveau
    for var in root.findall(".//DTS:Variable", ns):
        name = var.get(dts_ns + "ObjectName", "")
        namespace = var.get(dts_ns + "Namespace", "")
        value_elem = var.find("DTS:VariableValue", ns)
        value = value_elem.text if value_elem is not None else ""
        if name and name != 'None':
            results["Variables"].append({
                "Name": name,
                "Value": value,
                "Namespace": namespace
            })

    # Exécutables (tâches) - gérer les deux formats
    for exe in root.findall(".//DTS:Executable", ns):
        # Format ancien
        props = {p.get(dts_ns + "Name"): (p.text or "") for p in exe.findall("DTS:Property", ns)}
        name = props.get("ObjectName") or exe.get(dts_ns + "ObjectName", "")
        creation_name = props.get("CreationName") or exe.get(dts_ns + "CreationName", "")
        exe_type = exe.get(dts_ns + "ExecutableType")
        description = props.get("Description") or exe.get(dts_ns + "Description", "")
        
        if name and name != 'None':
            executable_info = {
                "Name": name,
                "Type": creation_name,
                "ExecutableType": exe_type,
                "Description": description,
                "DTSID": props.get("DTSID") or exe.get(dts_ns + "DTSID", "")
            }
            
            # Extraire les détails spécifiques selon le type de tâche
            if "FileSystemTask" in str(creation_name):
                executable_info.update(extract_file_system_task_details(exe, ns, dts_ns))
            elif "ExecuteSQLTask" in str(creation_name) or "SQLTask" in str(creation_name):
                executable_info.update(extract_sql_task_details(exe, ns, dts_ns))
            elif "ScriptTask" in str(creation_name):
                executable_info.update(extract_script_task_details(exe, ns, dts_ns))
            elif "DataFlowTask" in str(creation_name) or "{E3CFBEA8-1F48-40D8-91E1-2DEDC1EDDD56}" in str(creation_name):
                executable_info.update(extract_data_flow_task_details(exe, ns, dts_ns))
            
            results["Executables"].append(executable_info)

    # Contraintes de précédence
    for constraint in root.findall(".//DTS:PrecedenceConstraint", ns):
        # Format ancien
        props = {p.get(dts_ns + "Name"): (p.text or "") for p in constraint.findall("DTS:Property", ns)}
        
        # Chercher les références d'exécutables
        from_executable = ""
        to_executable = ""
        for exec_ref in constraint.findall("DTS:Executable", ns):
            if exec_ref.get("DTS:IsFrom") == "1":
                from_executable = exec_ref.get("IDREF")
            else:
                to_executable = exec_ref.get("IDREF")
        
        constraint_name = props.get("ObjectName") or constraint.get(dts_ns + "ObjectName", "")
        if constraint_name:
            results["PrecedenceConstraints"].append({
                "Name": constraint_name,
                "DTSID": props.get("DTSID") or constraint.get(dts_ns + "DTSID", ""),
                "FromExecutable": from_executable,
                "ToExecutable": to_executable,
                "Value": props.get("Value") or constraint.get(dts_ns + "Value", ""),
                "EvalOp": props.get("EvalOp") or constraint.get(dts_ns + "EvalOp", ""),
                "Expression": props.get("Expression") or constraint.get(dts_ns + "Expression", "")
            })

    return results

def extract_file_system_task_details(executable, ns, dts_ns):
    """Extrait les détails d'une tâche File System"""
    details = {}
    object_data = executable.find("DTS:ObjectData", ns)
    if object_data is not None:
        file_system_data = object_data.find("FileSystemTask:FileSystemTaskData")
        if file_system_data is not None:
            details["Operation"] = file_system_data.get("FileSystemTask:Operation")
            details["Source"] = file_system_data.get("FileSystemTask:Source")
            details["Destination"] = file_system_data.get("FileSystemTask:Destination")
            details["OverwriteDestination"] = file_system_data.get("FileSystemTask:OverwriteDestination")
    return details

def extract_sql_task_details(executable, ns, dts_ns):
    """Extrait les détails d'une tâche Execute SQL"""
    details = {}
    object_data = executable.find("DTS:ObjectData", ns)
    if object_data is not None:
        sql_task_data = object_data.find("SQLTask:SqlTaskData")
        if sql_task_data is not None:
            details["Connection"] = sql_task_data.get("SQLTask:Connection")
            details["SqlStatementSource"] = sql_task_data.get("SQLTask:SqlStatementSource")
            details["IsStoredProc"] = sql_task_data.get("SQLTask:IsStoredProc")
            details["ResultType"] = sql_task_data.get("SQLTask:ResultType")
            details["TimeOut"] = sql_task_data.get("SQLTask:TimeOut")
            details["CodePage"] = sql_task_data.get("SQLTask:CodePage")
            details["SqlStmtSourceType"] = sql_task_data.get("SQLTask:SqlStmtSourceType")
    return details

def extract_script_task_details(executable, ns, dts_ns):
    """Extrait les détails d'une tâche Script"""
    details = {}
    object_data = executable.find("DTS:ObjectData", ns)
    if object_data is not None:
        # Chercher le code dans différents formats possibles
        script_data = object_data.find("ScriptTask:ScriptTaskData")
        if script_data is not None:
            details["Language"] = script_data.get("ScriptTask:ScriptLanguage", "Unknown")
            details["EntryPoint"] = script_data.get("ScriptTask:EntryPoint", "Main")
            
            # Chercher le code source dans différents emplacements
            code_source = script_data.get("ScriptTask:ScriptCode")
            if not code_source:
                # Essayer de trouver le code dans les éléments enfants
                for child in script_data:
                    if "ScriptCode" in str(child.tag):
                        code_source = child.text
                        break
            
            if code_source:
                # Essayer d'extraire le vrai code source C#/VB
                main_code = extract_main_function(code_source)
                if main_code:
                    details["ScriptCode"] = main_code
                else:
                    details["ScriptCode"] = code_source
            else:
                details["ScriptCode"] = "(Code non trouvé)"
        else:
            # Format alternatif - chercher directement dans ObjectData
            for child in object_data:
                if "Script" in str(child.tag):
                    details["Language"] = "C#"
                    details["EntryPoint"] = "Main"
                    # Essayer d'extraire le code
                    code_text = ""
                    for code_elem in child.iter():
                        if code_elem.text and code_elem.text.strip():
                            code_text += code_elem.text
                    if code_text:
                        # Essayer d'extraire le vrai code source
                        main_code = extract_main_function(code_text)
                        if main_code:
                            details["ScriptCode"] = main_code
                        else:
                            details["ScriptCode"] = code_text
                    else:
                        details["ScriptCode"] = "(Code non trouvé dans ce format)"
                    break
    
    return details

def extract_main_function(code_text):
    """Extrait la fonction Main du code source"""
    if not code_text:
        return None
    
    # Chercher la fonction Main en C#
    csharp_patterns = [
        r"public void Main\(\)\s*\{.*?\n\s*\}\s*$",  # Pattern avec accolades
        r"public void Main\(\)\s*\{.*?\n\s*Dts\.TaskResult.*?\n\s*\}\s*$",  # Pattern avec TaskResult
    ]
    
    # Chercher la fonction Main en VB
    vb_patterns = [
        r"Public Sub Main\(\)\s*\n.*?\nEnd Sub",  # Pattern VB
    ]
    
    # Essayer les patterns C#
    for pattern in csharp_patterns:
        match = re.search(pattern, code_text, re.DOTALL)
        if match:
            return match.group(0)
    
    # Essayer les patterns VB
    for pattern in vb_patterns:
        match = re.search(pattern, code_text, re.DOTALL)
        if match:
            return match.group(0)
    
    # Si pas de pattern trouvé, chercher manuellement
    if "public void Main()" in code_text:
        start = code_text.find("public void Main()")
        # Chercher la fin de la fonction (accolade fermante correspondante)
        brace_count = 0
        in_function = False
        end_pos = start
        
        for i, char in enumerate(code_text[start:], start):
            if char == '{':
                if not in_function:
                    in_function = True
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if in_function and brace_count == 0:
                    end_pos = i + 1
                    break
        
        if end_pos > start:
            return code_text[start:end_pos]
    
    # Si pas de fonction Main trouvée, retourner le début du code
    return code_text[:1000] + "..." if len(code_text) > 1000 else code_text

def extract_data_flow_task_details(executable, ns, dts_ns):
    """Extrait les détails d'une tâche Data Flow"""
    details = {}
    object_data = executable.find("DTS:ObjectData", ns)
    if object_data is not None:
        data_flow_data = object_data.find("DataFlow:DataFlow")
        if data_flow_data is not None:
            details["DataFlowType"] = "Data Flow Task"
            # Chercher les composants
            components = []
            for component in data_flow_data.findall(".//DataFlow:Component"):
                comp_info = {
                    "Name": component.get("DataFlow:Name"),
                    "Type": component.get("DataFlow:ComponentClassID")
                }
                components.append(comp_info)
            details["Components"] = components
    return details

def print_results(results):
    """Affiche les résultats de manière formatée selon les besoins de l'utilisateur"""
    
    print("=" * 80)
    print("ANALYSE DU PACKAGE DTSX")
    print("=" * 80)
    
    # Informations du package
    if results["PackageInfo"]:
        print(f"\n📦 PACKAGE: {results['PackageInfo'].get('ObjectName', 'N/A')}")
        print(f"   Version: {results['PackageInfo'].get('VersionMajor', '')}.{results['PackageInfo'].get('VersionMinor', '')}.{results['PackageInfo'].get('VersionBuild', '')}")
        print(f"   Créé le: {results['PackageInfo'].get('CreationDate', 'N/A')}")
    
    # 1. LISTE DES CONNEXIONS
    print(f"\n🔌 CONNEXIONS ({len(results['Connections'])}):")
    print("-" * 50)
    for i, conn in enumerate(results["Connections"], 1):
        print(f"{i:2d}. {conn['Name']}")
        print(f"    Type: {conn['Type']}")
        if conn['ConnectionString']:
            conn_str = conn['ConnectionString'][:100] + "..." if len(conn['ConnectionString']) > 100 else conn['ConnectionString']
            print(f"    Connexion: {conn_str}")
        print()
    
    # 2. PARAMÈTRES ET VARIABLES
    print(f"\n📋 PARAMÈTRES ET VARIABLES ({len(results['Variables'])}):")
    print("-" * 50)
    for i, var in enumerate(results["Variables"], 1):
        print(f"{i:2d}. {var['Name']}")
        print(f"    Namespace: {var['Namespace']}")
        if var['Value']:
            value = var['Value'][:100] + "..." if len(var['Value']) > 100 else var['Value']
            print(f"    Valeur: {value}")
        print()
    
    # 3. LISTE DES TÂCHES
    print(f"\n⚙️ TÂCHES ({len(results['Executables'])}):")
    print("-" * 50)
    for i, e in enumerate(results["Executables"], 1):
        print(f"{i:2d}. {e['Name']}")
        print(f"    Type: {e['Type']}")
        if e['Description']:
            print(f"    Description: {e['Description']}")
        
        # Détails spécifiques selon le type
        if "FileSystemTask" in str(e.get('Type', '')):
            if "Operation" in e:
                print(f"    Opération: {e['Operation']}")
            if "Source" in e:
                print(f"    Source: {e['Source']}")
            if "Destination" in e:
                print(f"    Destination: {e['Destination']}")
        
        elif "ExecuteSQLTask" in str(e.get('Type', '')) or "SQLTask" in str(e.get('Type', '')):
            if "SqlStatementSource" in e:
                sql = e['SqlStatementSource']
                if sql:
                    print(f"    SQL: {sql[:100]}...")
                else:
                    print(f"    SQL: (requête non trouvée)")
            
            if "Connection" in e:
                print(f"    Connexion: {e['Connection']}")
            
            if "IsStoredProc" in e:
                print(f"    Procédure stockée: {e['IsStoredProc']}")
        
        elif "ScriptTask" in str(e.get('Type', '')):
            if "Language" in e:
                print(f"    Langage: {e['Language']}")
            if "EntryPoint" in e:
                print(f"    Point d'entrée: {e['EntryPoint']}")
            
            # Afficher le code Main
            if "ScriptCode" in e:
                script_code = e['ScriptCode']
                if script_code and script_code != "(Code non trouvé)" and script_code != "(Code non trouvé dans ce format)":
                    print(f"    Code Main:")
                    # Afficher les premières lignes du code
                    lines = script_code.split('\n')
                    for j, line in enumerate(lines[:10]):  # Afficher les 10 premières lignes
                        print(f"      {j+1:2d}: {line}")
                    if len(lines) > 10:
                        print(f"      ... ({len(lines)-10} lignes supplémentaires)")
                else:
                    print(f"    Code Main: {script_code}")
        
        elif "DataFlowTask" in str(e.get('Type', '')):
            if "Components" in e:
                print(f"    Composants: {len(e['Components'])}")
                for comp in e['Components'][:3]:  # Afficher les 3 premiers composants
                    print(f"      - {comp['Name']} ({comp['Type']})")
                if len(e['Components']) > 3:
                    print(f"      ... ({len(e['Components'])-3} composants supplémentaires)")
        
        print()
    
    # 4. CONTRAINTES DE PRÉCÉDENCE
    if results["PrecedenceConstraints"]:
        print(f"\n🔗 CONTRAINTES DE PRÉCÉDENCE ({len(results['PrecedenceConstraints'])}):")
        print("-" * 50)
        for i, constraint in enumerate(results["PrecedenceConstraints"], 1):
            print(f"{i:2d}. {constraint['Name']}")
            print(f"    De: {constraint['FromExecutable']}")
            print(f"    Vers: {constraint['ToExecutable']}")
            if constraint['Expression']:
                print(f"    Expression: {constraint['Expression']}")
            print()

if __name__ == "__main__":
    try:
        dtsx_file = "FICHIER_CLIENTS_BALEXERT_FILE_VX.dtsx"
        infos = parse_dtsx(dtsx_file)
        print_results(infos)
    except Exception as e:
        print(f"Erreur: {e}")
        import traceback
        traceback.print_exc()
