/* web-ext yapılandırması (AMO'ya gönderim/imzalama için).
 * Paketlenirken yalnızca eklentinin çalışması için gereken dosyalar alınır.
 */

'use strict';

module.exports = {
  artifactsDir: 'dist',
  ignoreFiles: [
    'tests',
    '.github/**',
    'dist/**',
    'web-ext-artifacts/**',
    'node_modules/**',
    'package.json',
    'package-lock.json',
    'build.sh',
    'README.md',
    'LICENSE',
    '.gitignore',
    'web-ext-config.cjs',
    'amo-metadata.json',
  ],
};
