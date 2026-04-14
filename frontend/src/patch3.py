with open('/root/.openclaw/workspace/youmind-project/frontend/src/components/AIChatBox.tsx', 'r') as f:
    text = f.read()

text = text.replace("import { cn } from '@/utils'", "import { cn } from '@/lib/utils'")

with open('/root/.openclaw/workspace/youmind-project/frontend/src/components/AIChatBox.tsx', 'w') as f:
    f.write(text)
