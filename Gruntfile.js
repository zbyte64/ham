module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    clean: {
      app: {
        src: ["dist", "build"]
      }
    },
    transpile: {
      cjs: {
        type: "cjs",
        compatFix: true,
        files: [{
          expand: true,
          cwd: 'src',
          src: ['**/*.js'],
          dest: 'dist/cjs'
        }]
      },
      amd: {
        type: "amd",
        compatFix: true,
        files: [{
          expand: true,
          cwd: 'src',
          src: ['**/*.js'],
          dest: 'dist/amd'
        }]
      }
    },
    concat: {
      options: {
        separator: ';',
      },
      cjs: {

        src: [
          'dist/cjs/**/*.js'
        ],
        dest: 'dist/ham.js'
      },
      amd: {
        options: {
          banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n' +
           'define("ham", ["/ham"], function(ham) {return ham});\n'
        },
        src: [
          'dist/amd/**/*.js'
        ],
        dest: 'dist/ham.amd.js'
      }
    },
    uglify: {

      ham: {
        src: 'dist/ham.amd.js',
        dest: 'dist/ham.min.js'
      }
    },
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-es6-module-transpiler');

  grunt.registerTask('default', ['clean', 'transpile', 'concat', 'uglify'])
}
