// Uso: node --import ./tests/support/register.mjs --test tests/*.test.mjs
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
