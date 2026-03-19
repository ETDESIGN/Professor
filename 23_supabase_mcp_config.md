# 23. Supabase MCP Configuration

## 1. Goal
To provide the necessary configuration for AI agents to interact with the Supabase project directly via the Model Context Protocol (MCP).

## 2. Server Configuration
Add the following to your MCP settings (e.g., in `.gemini/antigravity/antigravity.json` or your local MCP config):

```json
{
  "servers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=xsdnzijketjnzhakqtit"
    }
  }
}
```

## 3. Project Details
- **Project Ref:** `xsdnzijketjnzhakqtit`
- **MCP Endpoint:** `https://mcp.supabase.com/mcp?project_ref=xsdnzijketjnzhakqtit`

## 4. Usage
This MCP server allows the AI agent to:
- Introspect the database schema.
- Create and modify tables.
- Manage Edge Functions.
- Verify real-time channel configurations.
- Update Row Level Security (RLS) policies.
