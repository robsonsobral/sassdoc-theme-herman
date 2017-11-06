'use strict';

const autoprefixer = require('gulp-autoprefixer');
const browserSync = require('browser-sync').create();
const chalk = require('chalk');
const del = require('del');
const eslint = require('gulp-eslint');
const gulp = require('gulp');
const gutil = require('gulp-util');
const imagemin = require('gulp-imagemin');
const mocha = require('gulp-spawn-mocha');
const path = require('path');
const prettier = require('gulp-prettier-plugin');
const rename = require('gulp-rename');
const sass = require('gulp-sass');
const sassdoc = require('sassdoc');
const sasslint = require('gulp-sass-lint');
const sourcemaps = require('gulp-sourcemaps');
const svg = require('gulp-svg-symbols');
const uglify = require('gulp-uglify-es').default;
const { spawn } = require('child_process');

// Theme and project specific paths.
const paths = {
  DIST_DIR: 'dist/',
  SASS_DIR: 'scss/',
  SASS_TESTS_DIR: 'test/sass/',
  IMG: 'assets/img/**/*',
  SVG: 'assets/svg/**/*.svg',
  ASSETS_JS_DIR: 'assets/js/',
  FONTS: 'assets/fonts/**/*',
  DOCS_DIR: 'docs/',
  JS_TESTS_DIR: 'test/',
  TEMPLATES_DIR: 'templates/',
  IGNORE: ['!**/.#*', '!**/flycheck_*'],
  init() {
    this.TEMPLATES = [`${this.TEMPLATES_DIR}**/*.j2`].concat(this.IGNORE);
    this.SASS = [`${this.SASS_DIR}**/*.scss`].concat(this.IGNORE);
    this.ASSETS_JS = [`${this.ASSETS_JS_DIR}**/*.js`].concat(this.IGNORE);
    this.JS_TESTS = ['lib/**/*.js', 'index.js'].concat(this.IGNORE);
    this.ALL_JS = [
      `${this.ASSETS_JS_DIR}**/*.js`,
      'lib/**/*.js',
      `${this.JS_TESTS_DIR}**/*.js`,
      'gulpfile.js',
      'index.js',
      '!assets/js/highlight.js',
      '!assets/js/jquery-3.1.1.slim.js',
      '!assets/js/srcdoc-polyfill.min.js',
    ].concat(this.IGNORE);
    this.JS_TESTS_FILES = [
      `${this.JS_TESTS_DIR}*.js`,
      `${this.JS_TESTS_DIR}**/*.j2`,
    ].concat(this.IGNORE);
    return this;
  },
}.init();

// Try to ensure that all processes are killed on exit
const spawned = [];
process.on('exit', () => {
  spawned.forEach(pcs => {
    pcs.kill();
  });
});

const onError = function(err) {
  gutil.log(chalk.red(err.message || `Task failed with code: ${err}`));
  gutil.beep();
  if (this && this.emit) {
    this.emit('end');
  }
};

// Execute a command, logging output live while process runs
const spawnTask = function(command, args, cb, failOnError = true) {
  spawned.push(
    spawn(command, args, { stdio: 'inherit' })
      .on('error', err => {
        if (failOnError) {
          gutil.beep();
          return cb(err);
        }
        onError(err);
        return cb();
      })
      .on('exit', code => {
        if (code) {
          if (failOnError) {
            gutil.beep();
            return cb(new Error(`Task failed with code ${code}`));
          }
          onError(code);
        }
        return cb();
      })
  );
};

const eslintTask = (src, failOnError, log) => {
  if (log) {
    const cmd = `eslint ${src}`;
    gutil.log('Running', `'${chalk.cyan(cmd)}'...`);
  }
  const stream = gulp
    .src(src)
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
  if (!failOnError) {
    stream.on('error', onError);
  }
  return stream;
};

const prettierTask = function(src, log) {
  if (log) {
    const cmd = `prettier ${src}`;
    gutil.log('Running', `'${chalk.cyan(cmd)}'...`);
  }
  return gulp
    .src(src, { base: './' })
    .pipe(prettier({ singleQuote: true, trailingComma: 'es5' }))
    .pipe(gulp.dest('./'))
    .on('error', onError);
};

const sasslintTask = function(src, failOnError, log) {
  if (log) {
    const cmd = `sasslint ${src}`;
    gutil.log('Running', `'${chalk.cyan(cmd)}'...`);
  }
  const stream = gulp
    .src(src)
    .pipe(sasslint())
    .pipe(sasslint.format())
    .pipe(sasslint.failOnError());
  if (!failOnError) {
    stream.on('error', onError);
  }
  return stream;
};

gulp.task('prettier', () => prettierTask(paths.ALL_JS));

gulp.task('eslint', ['prettier'], () => eslintTask(paths.ALL_JS, true));

gulp.task('eslint-nofail', () => eslintTask(paths.ALL_JS));

gulp.task('sasslint', () => sasslintTask(paths.SASS, true));

gulp.task('sasslint-nofail', () => sasslintTask(paths.SASS));

gulp.task('sass', () =>
  gulp
    .src(paths.SASS)
    .pipe(sourcemaps.init())
    .pipe(sass({ outputStyle: 'compressed' }))
    .on('error', onError)
    .pipe(
      autoprefixer({
        browsers: ['last 2 versions'],
        cascade: false,
      })
    )
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(`${paths.DIST_DIR}css/`))
);

gulp.task('sasstest', () =>
  gulp.src(`${paths.SASS_TESTS_DIR}test_sass.js`, { read: false }).pipe(mocha())
);

const getJsTestArgs = verbose => {
  const mochaReporter = verbose ? 'spec' : 'dot';
  const covReporters = verbose
    ? ['text', 'html', 'lcovonly']
    : ['text-summary', 'html', 'lcovonly'];
  const obj = {
    include: paths.JS_TESTS,
    reporter: covReporters,
    cache: true,
    all: true,
    'report-dir': './jscov',
  };
  const args = ['./node_modules/.bin/mocha', '--reporter', mochaReporter];
  for (const key of Object.keys(obj)) {
    if (Array.isArray(obj[key])) {
      for (const val of obj[key]) {
        args.unshift(`--${key}=${val}`);
      }
    } else {
      args.unshift(`--${key}=${obj[key]}`);
    }
  }
  return args;
};

gulp.task('jstest', cb => {
  spawnTask('./node_modules/.bin/nyc', getJsTestArgs(true), cb);
});

gulp.task('jstest-nofail', cb => {
  spawnTask('./node_modules/.bin/nyc', getJsTestArgs(), cb, false);
});

gulp.task('test', ['sasstest', 'jstest']);

gulp.task('browser-sync', cb => {
  browserSync.init(
    {
      open: false,
      server: {
        baseDir: paths.DOCS_DIR,
      },
      logLevel: 'info',
      logPrefix: 'herman',
      notify: false,
      ghostMode: false,
      files: [`${paths.DOCS_DIR}**/*`],
      reloadDelay: 300,
      reloadThrottle: 500,
      // Because we're debouncing, we always want to reload the page to prevent
      // a case where the CSS change is detected first (and injected), and
      // subsequent JS/HTML changes are ignored.
      injectChanges: false,
    },
    cb
  );
});

// SassDoc compilation.
// See: http://sassdoc.com/customising-the-view/
gulp.task('compile', ['sass', 'minify'], () => {
  const config = {
    verbose: true,
    dest: paths.DOCS_DIR,
    theme: './',
    herman: {
      subprojects: [
        'accoutrement-color',
        'accoutrement-scale',
        'accoutrement-type',
        'accoutrement-layout',
        'accoutrement-init',
      ],
      templatepath: path.join(__dirname, 'templates'),
      sass: {
        jsonfile: `${paths.DIST_DIR}css/json.css`,
        includepaths: [path.join(__dirname, 'scss')],
        includes: ['utilities', 'config/manifest'],
      },
      customCSS: `${paths.DIST_DIR}css/main.css`,
      minifiedIcons: `${paths.TEMPLATES_DIR}_icons.svg`,
      displayColors: ['hex', 'hsl'],
      extraDocs: [{ name: 'Changelog', path: './CHANGELOG.md' }],
    },
    display: {
      alias: true,
    },
    groups: {
      'api_sass-utilities': 'Sass API',
      demo_mixins: 'Documenting Mixins & Functions',
      demo_variables: 'Documenting Variables',
      'config-colors': '_Config: Colors',
      'config-scale': '_Config: Sizes',
      'config-fonts': '_Config: Fonts',
      'config-utils': '_Config: Utilities',
      'config-z-index': '_Config: Z-index',
      'style-typography': '_Typography',
      'style-icons': '_Icons',
      'style-nav': '_Navigation',
      'style-sections': '_Sections',
      'style-code': '_Code Blocks',
    },
    // Disable cache to enable live-reloading.
    // Usefull for some template engines (e.g. Swig).
    cache: false,
  };

  return gulp
    .src(path.join(`${paths.SASS_DIR}**/*.scss`))
    .pipe(sassdoc(config));
});

gulp.task('default', ['compile', 'eslint', 'sasslint', 'test']);

gulp.task('serve', ['watch', 'browser-sync']);

// Development task.
// While working on a theme.
gulp.task('dev', [
  'prettier',
  'eslint-nofail',
  'sasslint-nofail',
  'test',
  'watch',
]);

gulp.task('watch', () => {
  gulp.watch(
    [
      paths.ALL_JS,
      paths.SASS,
      paths.TEMPLATES,
      paths.IMG,
      paths.SVG,
      paths.FONTS,
      `${paths.TEMPLATES_DIR}_icon_template.lodash`,
      './README.md',
      './package.json',
    ],
    ['compile']
  );

  gulp.watch(paths.JS_TESTS_FILES, ['jstest-nofail']);

  gulp.watch(paths.SASS, ev => {
    if (ev.type === 'added' || ev.type === 'changed') {
      sasslintTask(ev.path, false, true);
    }
  });

  gulp.watch(paths.SASS, ['sasstest']);

  gulp.watch('**/.sass-lint.yml', ['sasslint-nofail']);
  gulp.watch('**/.eslintrc.yml', ['eslint-nofail']);
});

gulp.task('copy-fonts', () => {
  const dest = `${paths.DIST_DIR}fonts/`;

  return gulp.src(paths.FONTS).pipe(gulp.dest(dest));
});

gulp.task('jsmin', () => {
  const dest = `${paths.DIST_DIR}js/`;

  return gulp
    .src(paths.ASSETS_JS)
    .pipe(uglify())
    .pipe(gulp.dest(dest));
});

gulp.task('svg-clean', cb => {
  del(`${paths.TEMPLATES_DIR}_icons.svg`).then(() => {
    cb();
  });
});

gulp.task('svgmin', ['svg-clean'], () =>
  gulp
    .src(paths.SVG)
    .pipe(imagemin([imagemin.svgo()]))
    .pipe(
      svg({
        id: 'icon-%f',
        title: '%f icon',
        templates: [
          path.join(__dirname, paths.TEMPLATES_DIR, '_icon_template.lodash'),
        ],
      })
    )
    .pipe(rename('_icons.svg'))
    .pipe(gulp.dest(paths.TEMPLATES_DIR))
);

gulp.task('imagemin', () => {
  const dest = `${paths.DIST_DIR}img/`;

  return gulp
    .src(paths.IMG)
    .pipe(
      imagemin([
        imagemin.gifsicle(),
        imagemin.jpegtran(),
        imagemin.optipng(),
        imagemin.svgo(),
      ])
    )
    .pipe(gulp.dest(dest));
});

gulp.task('minify', ['jsmin', 'svgmin', 'imagemin', 'copy-fonts']);
