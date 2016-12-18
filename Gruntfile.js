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
      amd: {
        options: {
          banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n',
          footer: 'define("ham", ["/ham"], function(ham) {return ham});\n'
        },
        src: [
          'dist/amd/**/*.js'
        ],
        dest: 'dist/ham.amd.js'
      }
    },
    'babel': {
        dist: {
            files: {
              'dist/ham.amd.js': 'dist/ham.amd.js'
            }
        }
    },
    uglify: {
      ham: {
        src: 'dist/ham.amd.js',
        dest: 'dist/ham.min.js'
      }
    },
    jasmine_node: {
      options: {
        forceExit: true,
        verbose: true,
        match: '.',
        matchall: false,
        extensions: 'js',
        specNameMatcher: 'spec',
        jUnit: {
          report: true,
          savePath : "./build/reports/jasmine/",
          useDotNotation: true,
          consolidate: true
        }
      },
      all: ['spec/']
    }
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-es6-module-transpiler');
  grunt.loadNpmTasks('grunt-jasmine-node');
  grunt.loadNpmTasks('grunt-babel');

  grunt.registerTask('build', ['clean', 'transpile', 'concat'])
  grunt.registerTask('dist', ['build', 'babel','uglify'])
  grunt.registerTask('default', ['dist'])
  grunt.registerTask('test', ['build', 'jasmine_node'])
}
