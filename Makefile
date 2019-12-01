TSSRC := $(wildcard *.ts)
JSSRC := $(TSSRC:.ts=.js)
JSSRC := $(filter-out *bundle*, $(JSSRC))

all: index.bundle.js mini-dark.min.css index.bundle.min.es6.js

mini-dark.min.css: node_modules/mini.css/dist/mini-dark.min.css
	cp node_modules/mini.css/dist/mini-dark.min.css .

%.js: %.ts
	npm run build

index.bundle.js: $(JSSRC)
	npm run dist
	echo done

index.bundle.min.es6.js: index.bundle.js
	cp index.bundle.js index.bundle.min.es6.js
	npm run min

# Assumes VS Code is running in watch build mode
watch:
	fswatch -0 -o -l .1 $(JSSRC) | xargs -0 -n 1 -I {} make