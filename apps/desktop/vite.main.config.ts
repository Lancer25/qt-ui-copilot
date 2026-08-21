import { builtinModules } from 'node:module';

export default {
  build: {
    rollupOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)],
    },
  },
};
