# Shortcuts for the everyday commands; everything runs through npm.

.DEFAULT_GOAL := help
.PHONY: help install build check test lint typecheck package countries discover preview clean release-patch release-minor

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /|/' | column -t -s '|'

install: ## Install dependencies
	npm ci

build: ## Build the anthem data from the curated sources (uses the cache)
	npm run build

package: ## Compile the typed package entry to dist/
	npm run build:package

check: typecheck lint test ## Typecheck, lint and tests

test: ## Vitest
	npm test

lint: ## ESLint
	npm run lint

typecheck: ## tsc
	npm run typecheck

countries: ## Derive the country list from the game's region boxes
	npm run countries

discover: ## Search Wikimedia for candidate scores
	npm run discover

preview: ## Render the anthems as WAV previews
	npm run preview

clean: ## Remove build output and previews
	rm -rf dist preview

release-patch: ## Bump the patch version, tag it and push - CI publishes to npm
	npm version patch && git push --follow-tags

release-minor: ## Bump the minor version, tag it and push - CI publishes to npm
	npm version minor && git push --follow-tags
