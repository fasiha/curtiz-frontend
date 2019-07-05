TSSRC=$(wildcard *.ts)
JSSRC=$(TSSRC:.ts=.js)

all: index.bundle.js

%.js: %.ts
	npm run build

index.bundle.js: $(JSSRC)
	npm run dist

# Assumes VS Code is running in watch build mode
watch:
	fswatch -0 -o -l .1 $(JSSRC) | xargs -0 -n 1 -I {} make