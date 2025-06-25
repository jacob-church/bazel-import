// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');
const path = require('path');

module.exports = defineConfig({ 
    files: 'out/test/**/*.test.js', 
    mocha: {
        timeout: 0
    }, 
    extensionDevelopmentPath: path.resolve(__dirname, 'src', 'test', 'config'),
    extensionTestsPath: path.resolve(__dirname, 'out', 'test', 'suite', 'index')
});