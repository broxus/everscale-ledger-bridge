const path = require('path')

const {ProvidePlugin} = require('webpack')
const {CleanWebpackPlugin} = require('clean-webpack-plugin')

module.exports = {
    entry: path.resolve(__dirname, './src/index.js'),
    plugins: [
        new CleanWebpackPlugin({cleanStaleWebpackAssets: false}),
        new ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
        }),
        new ProvidePlugin({
            process: 'process/browser',
        }),
    ],
    resolve: {
        extensions: ['.js'],
        fallback: {
            buffer: require.resolve('buffer'),
        },
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, './build'),
    },
}
