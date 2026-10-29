import { builtinModules } from 'node:module';

export default {
  ssr: {
    noExternal: true,
  },
  build: {
    rollupOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)],
    },
  },
};
