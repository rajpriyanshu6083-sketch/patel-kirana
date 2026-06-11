
import sys
script = open('static/js/app.js', encoding='utf-8').read()

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
    print(f'Unclosed {{ at index {stack[-1]}')
    line_start = script.rfind('\n', 0, stack[-1])
    line_end = script.find('\n', stack[-1])
    print(script[line_start:line_end])
else:
    print('Braces are balanced!')

