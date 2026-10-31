import { derivePolymorphicId } from '../../src/core/crypto-prng';
import { ShieldMode } from '../../src/core/shield.config';

export interface ReaPoisonPluginOptions {
  mode?: ShieldMode;
  secretSeed?: string;
}

/**
 * Plugin Vite para injeção de estruturas arquiteturais decoy (AST Poisoning)
 * e desativação automática de sourcemaps em produção.
 */
export function vitePluginReaPoison(options?: ReaPoisonPluginOptions) {
  const mode: ShieldMode = options?.mode || 'simulation';
  const seed = options?.secretSeed || 'hubi-polymorphic-seed-2026';

  return {
    name: 'vite-plugin-rea-poison',
    config(userConfig: Record<string, unknown>) {
      if (mode === 'production') {
        return {
          ...userConfig,
          build: {
            ...(typeof userConfig.build === 'object' && userConfig.build ? userConfig.build : {}),
            sourcemap: false,
          },
        };
      }
      return userConfig;
    },
    transformIndexHtml(html: string) {
      if (mode === 'development') return html;
      const buildToken = derivePolymorphicId('build-integrity-signature', seed, 'sig_');
      const decoyComment = `<!-- runtime-shader-pipeline:${buildToken} -->`;
      return html.replace('</head>', `  ${decoyComment}\n</head>`);
    },
  };
}
