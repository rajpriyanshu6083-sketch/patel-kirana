def check_all_balanced():
    with open('templates/index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    script_start = html.find('    <script>')
    if script_start == -1:
        script_start = html.find('\n    <script>')
    if script_start == -1:
        script_start = html.find('<script>')
        
    script_end = html.find('</script>', script_start)
    
    if script_start == -1 or script_end == -1:
        print("Could not find the main script block.")
        return
        
    js = html[script_start + html[script_start:].find('>') + 1 : script_end]
    
    # Strip comments and strings, keeping their structure (replace with spaces to keep indices aligned!)
    # We will replace string chars and comment chars with spaces so the indices match the original 'js' string exactly!
    js_clean = list(js)
    
    # Simple parser to blank out comments and strings
    i = 0
    n = len(js)
    while i < n:
        # Check single line comment
        if i < n - 1 and js[i] == '/' and js[i+1] == '/':
            js_clean[i] = ' '
            js_clean[i+1] = ' '
            i += 2
            while i < n and js[i] != '\n':
                js_clean[i] = ' '
                i += 1
        # Check block comment
        elif i < n - 1 and js[i] == '/' and js[i+1] == '*':
            js_clean[i] = ' '
            js_clean[i+1] = ' '
            i += 2
            while i < n - 1 and not (js[i] == '*' and js[i+1] == '/'):
                if js[i] != '\n':
                    js_clean[i] = ' '
                i += 1
            if i < n - 1:
                js_clean[i] = ' '
                js_clean[i+1] = ' '
                i += 2
        # Check double quotes string
        elif js[i] == '"':
            js_clean[i] = ' '
            i += 1
            while i < n and js[i] != '"':
                if js[i] == '\\':
                    js_clean[i] = ' '
                    i += 1
                    if i < n:
                        js_clean[i] = ' '
                else:
                    if js[i] != '\n':
                        js_clean[i] = ' '
                i += 1
            if i < n:
                js_clean[i] = ' '
                i += 1
        # Check single quotes string
        elif js[i] == "'":
            js_clean[i] = ' '
            i += 1
            while i < n and js[i] != "'":
                if js[i] == '\\':
                    js_clean[i] = ' '
                    i += 1
                    if i < n:
                        js_clean[i] = ' '
                else:
                    if js[i] != '\n':
                        js_clean[i] = ' '
                i += 1
            if i < n:
                js_clean[i] = ' '
                i += 1
        # Check template literal
        elif js[i] == '`':
            js_clean[i] = ' '
            i += 1
            while i < n and js[i] != '`':
                if js[i] == '\\':
                    js_clean[i] = ' '
                    i += 1
                    if i < n:
                        js_clean[i] = ' '
                else:
                    if js[i] != '\n':
                        js_clean[i] = ' '
                i += 1
            if i < n:
                js_clean[i] = ' '
                i += 1
        else:
            i += 1
            
    js_clean = "".join(js_clean)
    
    brackets = {
        '{': '}',
        '[': ']',
        '(': ')'
    }
    
    stack = []
    
    for idx, char in enumerate(js_clean):
        if char in brackets.keys():
            stack.append((char, idx))
        elif char in brackets.values():
            if not stack:
                line_no = 3094 + js[:idx].count('\n') + 1
                print(f"Extra closing bracket '{char}' at line {line_no}")
                # print surrounding
                line_start = js.rfind('\n', 0, idx)
                line_end = js.find('\n', idx)
                print("Code line:", js[line_start:line_end])
                return
            top_char, top_idx = stack.pop()
            if brackets[top_char] != char:
                open_line = 3094 + js[:top_idx].count('\n') + 1
                close_line = 3094 + js[:idx].count('\n') + 1
                print(f"Mismatched bracket: opened '{top_char}' at line {open_line}, closed with '{char}' at line {close_line}")
                # print surrounding code
                open_line_start = js.rfind('\n', 0, top_idx)
                open_line_end = js.find('\n', top_idx)
                close_line_start = js.rfind('\n', 0, idx)
                close_line_end = js.find('\n', idx)
                print(f"Opening line {open_line}: {js[open_line_start:open_line_end].strip()}")
                print(f"Closing line {close_line}: {js[close_line_start:close_line_end].strip()}")
                return
                
    if stack:
        print(f"Unclosed brackets left: {len(stack)}")
        for char, idx in stack:
            line_no = 3094 + js[:idx].count('\n') + 1
            print(f"Unclosed '{char}' at line {line_no}")
    else:
        print("All brackets (curly, square, round) are perfectly balanced!")

if __name__ == '__main__':
    check_all_balanced()
