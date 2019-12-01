TSSRC := $(wildcard *.ts)
JSSRC := $(TSSRC:.ts=.js)
JSSRC := $(filter-out *bundle*, $(JSSRC))

all: index.bundle.js mini-dark.min.css

mini-dark.min.css: node_modules/mini.css/dist/mini-dark.min.css
	cp node_modules/mini.css/dist/mini-dark.min.css .

%.js: %.ts
	npm run build

index.bundle.js: index.js
	npm run dist
	echo done

# Assumes VS Code is running in watch build mode
watch:
	fswatch -0 -o -l .1 $(JSSRC) | xargs -0 -n 1 -I {} make