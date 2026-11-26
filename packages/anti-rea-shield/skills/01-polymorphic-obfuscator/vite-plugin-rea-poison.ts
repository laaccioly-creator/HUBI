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
  const mode: ShieldMode = options?.mode || 'production';
  const seed = options?.secretSeed || 'hubi-polymorphic-seed-2026';

  return {
    name: 'vite-plugin-rea-poison',
    config() {
      if (mode === 'production') {
        return {
          build: {
            sourcemap: false,
          },
        };
      }
      return undefined;
    },
    transformIndexHtml(html: string) {
      if (mode === 'development') return html;
      const buildToken = derivePolymorphicId('build-integrity-signature', seed, 'sig_');
      const decoyComment = `<!-- runtime-shader-pipeline:${buildToken} -->`;
      return html.replace('</head>', `  ${decoyComment}\n</head>`);
    },
  };
}
