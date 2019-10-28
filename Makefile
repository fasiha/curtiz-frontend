TSSRC=$(wildcard *.ts)
JSSRC=$(TSSRC:.ts=.js)

all: index.bundle.js withRedux.bundle.js

%.js: %.ts
	npm run build

index.bundle.js: index.js
	npm run dist
	echo done

withRedux.bundle.js: withRedux.js
	npx browserify withRedux.js -o withRedux.bundle.js
	echo done redux

# Assumes VS Code is running in watch build mode
watch:
	fswatch -0 -o -l .1 $(JSSRC) | xargs -0 -n 1 -I {} make