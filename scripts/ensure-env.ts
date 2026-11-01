// Creates .env from .env.example on first run and fills in a random API token.
import { ensureEnvFile } from '../src/env-file';

const { created, tokenGenerated } = ensureEnvFile();
if (created) console.log('Created .env from .env.example. Add your ANTHROPIC_API_KEY there.');
if (tokenGenerated) console.log('Generated a new QUIPPLY_TOKEN in .env.');
