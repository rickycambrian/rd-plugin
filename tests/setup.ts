import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Redirect ~/.rickydata and ~/.claude to a throwaway HOME so tests never read or
// write real user config, the shared derive-session cache, or transcripts. This
// runs before any test module (and therefore before src/lib/paths.ts computes
// its os.homedir()-based constants).
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-plugin-home-'));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;
fs.mkdirSync(path.join(tmpHome, '.rickydata'), { recursive: true });
