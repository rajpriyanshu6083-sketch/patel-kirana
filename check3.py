import sys, re
script = open('static/js/app.js', encoding='utf-8').read()
script = re.sub(r'//.*', '', script)
script = re.sub(r'/\*.*?\*/', '', script, flags=re.DOTALL)
script = re.sub(r'''"(?:\\.|[^\\"])*"''', '', script)
script = re.sub(r"'(?:\\.|[^\\'])*'", '', script)
script = re.sub(r'''`(?:\\.|[^\\`])*`''', '', script)

stack = []
for i, char in enumerate(script):
    if char == '{':
        stack.append(i)
    elif char == '}':
        if stack:
            stack.pop()
        else:
            print(f'Extra }} at {i}')

if stack:
    print(f'Unclosed {{ count: {len(stack)}')
else:
    print('Braces are balanced!')
