import re
with open('/root/.openclaw/workspace/youmind-project/frontend/src/components/AIChatBox.tsx', 'r') as f:
    text = f.read()

text = re.sub(r'>\s*Agent\s*</button>', '>Chat</button>', text)

with open('/root/.openclaw/workspace/youmind-project/frontend/src/components/AIChatBox.tsx', 'w') as f:
    f.write(text)
