module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    traceur: {
      options: {
        experimental: true,
        sourceMaps: true,
        typeAssertions: true,
        //validate: true,
        modules: 'amd',
        freeVariableChecker: true,
        commentCallback: true,
        debug: true
      },
      ham: {
        files: {
          'build/ham.js': ['src/**/*.js']
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-traceur');

  grunt.registerTask('default', ['traceur'])
}
