# Verwaltete Datei: nicht verändern (sonst PF-108). Eigene Ergänzungen in AGENTS.local.md beschreiben.
# Befehle für den Alltag: make dev | start | test | lint | docker | deploy
# Wartung: make lock | sdk-update
# Selbsttests des Golden Master (Plattform-Team): make check | check-skills | check-starter

IMAGE ?= hka/portal-app:0.1.0
# Gebaute SDK-Kopie aus dem Portal-Repository (dort: make sdk-release)
SDK_DIST ?= ../portal/sdk/dist/javascript/platform_sdk

.PHONY: dev start test lint docker deploy lock sdk-update check check-skills check-starter

dev:     ## App mit Test-Anmeldung starten (http://localhost:8080)
	PORTAL_DEV=1 npm run dev

start:   ## App wie im Betrieb starten
	npm run start

test:    ## automatische Tests
	npm test

lint:    ## Regeln prüfen (ESLint, Portal-Bibliothek)
	npm run lint

docker:  ## Container bauen
	docker build --tag $(IMAGE) .

deploy:  ## App auf die Test-VM bringen: make deploy VM=<host> (tools/deploy.sh)
	bash tools/deploy.sh

# Gleicht package-lock.json mit package.json ab und ändert keine Versionen. Update: Version in package.json ändern, dann make lock.
lock:    ## Abhängigkeiten neu festschreiben (package-lock.json)
	npm install --package-lock-only --no-audit --no-fund

sdk-update: ## Portal-Bibliothek (platform_sdk/) durch die freigegebene Kopie ersetzen
	@test -f $(SDK_DIST)/SHA256 || { echo "Keine SDK-Kopie in $(SDK_DIST). Im Portal-Repository: make sdk-release"; exit 1; }
	rsync -a --delete --exclude __pycache__ $(SDK_DIST)/ platform_sdk/
	node platform_sdk/verify-tree.js
	@echo "platform_sdk/ ist jetzt Version $$(cat platform_sdk/VERSION)."

# Läuft auch nach einem Fehler weiter, damit der Prüfnachweis (Vorlage B, Checkliste Code-Review) immer entsteht.
check: ## alle Selbsttests, make lint und make test; schreibt build/pruefberichte/pruefnachweis-aktuell.md
	@status=0; \
	$(MAKE) --no-print-directory check-skills || status=1; \
	$(MAKE) --no-print-directory check-starter || status=1; \
	node tools/tests/pruefnachweis.js || status=1; \
	exit $$status

check-skills: ## Skills in .agents/skills prüfen (Form, Regeln, Beispiele, Verweise)
	@mkdir -p build/pruefberichte
	node --test --test-reporter=./tools/tests/report.js --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=build/pruefberichte/skills.xml tools/tests/skills/skills.test.js

check-starter: ## Starter prüfen (Aufbau, Manifest, Container-Regeln, Anmeldung); mit Container: CHECK_DOCKER=1
	@mkdir -p build/pruefberichte
	node --test --test-reporter=./tools/tests/report.js --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=build/pruefberichte/starter.xml tools/tests/starter/starter.test.js
	npx eslint tools
