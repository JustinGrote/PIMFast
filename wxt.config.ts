import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    permissions: ['contentSettings', 'identity', 'storage', 'offscreen'],
    host_permissions: ['https://portal.azure.com/*', 'ws://localhost/*'],
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjg/jMkcgkCxsJs1I+ErRTM3xR+HmFO+B7N/i/Y/IgjxrFn2Zt/DMm/Sl3ZGHflcKoDkYWbX9X+eClm7Wfia0i7Ky77bjDSszH/my/sVJPYP0GYxRwjHcm3bQDe42MMX17V4Nrmew1YA0wx8pJV4vQRnkCnBzaVr+xb0Xa1qSXAo68amzFhZ0LnHP7pnVez03FFolm4jdNaOxISlTno3/hge4qI9ul3AlpbLn4hdmlnYv8oT19DUxLiaB5Bdl45c+JtQ+HZPkxggNdmz8UbGtkMewOhhYjxeuuuVNxKgwwWOrpNYWq2+p4JfdcEqKcyTcPF387RGv+zYxWjCYR1ww7wIDAQAB"
  }
});
