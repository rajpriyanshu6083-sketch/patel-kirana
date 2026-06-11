import re

def check_js_syntax():
    with open('templates/index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    # We want to extract the main script tag
    # Let's find the start tag '<script>' (no attributes)
    script_start = html.find('    <script>')
    if script_start == -1:
        script_start = html.find('\n    <script>')
    if script_start == -1:
        script_start = html.find('<script>')
        
    # Find the matching closing tag after script_start
    script_end = html.find('</script>', script_start)
    
    if script_start == -1 or script_end == -1:
        print("Could not find the main script block.")
        return
        
    js = html[script_start + html[script_start:].find('>') + 1 : script_end]
    print(f"Extracted JS of length: {len(js)} (start: {script_start}, end: {script_end})")
    
    # Strip comments and strings to avoid false positives
    # Clean block comments
    js_clean = re.sub(r'/\*.*?\*/', '', js, flags=re.DOTALL)
    # Clean line comments
    js_clean = re.sub(r'//.*', '', js_clean)
    
    # Track declarations (let, const, var, function)
    declarations = []
    # Find all let declarations
    for match in re.finditer(r'\b(let|const|var)\s+(\w+)\b', js_clean):
        declarations.append((match.group(1), match.group(2), match.start()))
        
    # Find all function declarations
    for match in re.finditer(r'\bfunction\s+(\w+)\b', js_clean):
        declarations.append(('function', match.group(1), match.start()))
        
    print(f"Found {len(declarations)} declarations.")
    
    # Check for duplicate declarations in global scope (simple approximation)
    global_decls = {}
    for dtype, name, pos in declarations:
        if name in global_decls:
            global_decls[name].append((dtype, pos))
        else:
            global_decls[name] = [(dtype, pos)]
            
    for name, decls in global_decls.items():
        if len(decls) > 1:
            print(f"Warning: Multiple declarations for '{name}': {decls}")
            
    # Check if any variables/functions are used before declaration in global scope
    # (i.e. outside of any function body or class definition)
    # Let's extract top-level lines of code
    # We can count brace nesting
    nesting = 0
    lines = js.split('\n')
    current_line_num = 3094
    for line in lines:
        current_line_num += 1
        # count braces
        # very simple brace parser
        stripped = re.sub(r'//.*', '', line)
        stripped = re.sub(r'/\*.*?\*/', '', stripped)
        # ignore quotes
        stripped = re.sub(r'"[^"]*"', '""', stripped)
        stripped = re.sub(r"'[^']*'", "''", stripped)
        
        open_braces = stripped.count('{')
        close_braces = stripped.count('}')
        
        # If we are at nesting level 0 and we have a statement that executes immediately
        # (e.g. not a function definition or assignment to a function)
        if nesting == 0:
            trimmed = stripped.strip()
            if trimmed and not trimmed.startswith(('function', 'const', 'let', 'var', 'class', 'import', 'export', '/*', '*', '//', '}') ) and not trimmed.endswith('{'):
                # Immediate statement execution
                words = re.findall(r'\b[a-zA-Z_]\w*\b', trimmed)
                for w in words:
                    for dtype, name, pos in declarations:
                        if name == w and dtype in ('const', 'let'):
                            # Find line number of declaration
                            decl_offset_in_js = pos
                            # find line number by counting newlines in js up to pos
                            decl_line = 3094 + js[:pos].count('\n') + 1
                            if decl_line > current_line_num:
                                print(f"Warning: Global statement at line {current_line_num} uses '{name}' before declaration at line {decl_line}: {trimmed}")
        
        nesting += open_braces - close_braces

if __name__ == '__main__':
    check_js_syntax()
