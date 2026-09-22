# DeepSeek AI configuration

Cloud Mail uses DeepSeek for AI-written email drafts. The API key is entered by an administrator in System Settings and encrypted before it is stored in D1. The frontend only receives whether a key is configured.

## Configuration

The default model is `deepseek-flash`. The official OpenAI-compatible endpoint is `https://api.deepseek.com/chat/completions`.

After deploying version 4.4, run the authenticated incremental migration. Then open System Settings -> DeepSeek AI, enter the API key, choose the model, and enable it.

The API key is encrypted with the Worker `jwt_secret` before it is written to D1. Rotating `jwt_secret` requires re-entering the DeepSeek key.

The existing Workers AI verification-code extractor remains independent and is not affected by this provider change.
