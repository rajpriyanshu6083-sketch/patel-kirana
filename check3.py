import sys, re
content = open('templates/index.html', encoding='utf-8').read()
script_start = content.find('<script>')
script_end = content.find('</script>')
script = content[script_start:script_end]
script = re.sub(r'//.*', '', script)
script = re.sub(r'/\*.*?\*/', '', script, flags=re.DOTALL)
script = re.sub(r'''"(?:\\.|[^\\"])*"''', '', script)
script = re.sub(r''''(?:\\.|[^\\'])*''', '', script)
script = re.sub(r'''`(?:\\.|[^\\`])*`"n', '', script)

stack = []
for i, char in enumerate(script):
    if char == '{':
        stack.append(i)
    elif char == '}':
        if stack:
            stack.pop()
        else:
            print(f'Extra } at {i}')

if stack:
    print(f'Unclosed {{ count: {len(stack)}')
else:
    print('Braces are balanced!')
