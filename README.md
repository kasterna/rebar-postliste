# Søk Armering

En Trimble Connect-extension (side-panel i 3D Viewer) som lister opp all armering som er synlig i modellen akkurat nå, gruppert etter posisjonsnummer. Klikk på en rad for å velge og zoome til alle stenger med det postnummeret — eller klikk på en stang i 3D-modellen for å highlighte og finne raden i lista.

Inspirert av "Rebar Label" fra BuildingPoint Scandinavia.

![ikon](icon.svg)

## Funksjoner

- Henter alle synlige armeringselementer (`IfcReinforcingBar` / `IfcReinforcingMesh`) med "Oppdater liste"
- Grupperer elementene per posisjonsnummer og viser antall, diameter, lengde, formkode og segment
- Sorterbar tabell — klikk på en kolonneoverskrift for å sortere
- **Liste → modell:** klikk på en rad velger og zoomer til alle stenger med det postnummeret
- **Modell → liste:** klikk på én stang i 3D-viewer utvider valget til alle stenger med samme postnummer, highlighter raden og flytter den øverst i lista

## Hvordan det leser ut data

Extensionen kobler seg til Trimble Connect via [`trimble-connect-workspace-api`](https://www.npmjs.com/package/trimble-connect-workspace-api) og bruker `viewer.getObjects` + `viewer.getObjectProperties` til å hente egenskaper for synlige objekter.

Den er testet mot IFC-modeller eksportert fra Tekla, og forventer disse property-navnene i property-settet for armering:

| Kolonne i lista | Property-navn i modellen |
|---|---|
| Postnr | `Posisjonsnummer` |
| Diameter | `Diameter jern` |
| Lengde | `Armeringslengde` |
| Formkode | `Formkode` |
| Segment | `Segment` |

Elementer identifiseres som armering enten via IFC-klassen (`IfcReinforcingBar`/`IfcReinforcingMesh`) eller feltet `Common Type` (`REINFORCINGBAR`/`REINFORCINGMESH`).

**Bruker du en modell fra et annet program enn Tekla, eller andre property-navn?** Sjekk property-panelet i Trimble Connect på et armeringselement, og oppdater konstantene/oppslagene i [app.js](app.js) (funksjonen `findProperty` og `REBAR_CLASSES`/`REBAR_COMMON_TYPES`).

## Legge til i et Trimble Connect-prosjekt

1. Gå til **Project Settings → Extensions** i prosjektet
2. Velg **Add Custom Extension**
3. Lim inn manifest-URL-en: `https://kasterna.github.io/rebar-postliste/manifest.json`
4. Aktiver extensionen og åpne den fra 3D Viewer-sidepanelet

## Kjente begrensninger

- "Synlig" betyr objekter som ikke er skjult/filtrert bort i visningen — **ikke** kamera-frustum. Et element som er synlig-som-i-ikke-skjult, men befinner seg utenfor det du faktisk ser på skjermen, dukker fortsatt opp i lista.
- Gruppering skjer kun på posisjonsnummer. Har du samme postnummer brukt med ulik lengde/diameter i ulike deler av modellen, vises kun verdiene fra første treff i lista (selv om alle stenger med det nummeret velges/highlightes riktig ved klikk).
- Ingen eksport til Excel/CSV ennå.

## Lokal utvikling

```bash
npm install
npm run dev   # eller: npx http-server -p 8080 --cors
```

Åpne `http://localhost:8080` i nettleseren. Merk at `WorkspaceAPI.connect()` kun får ekte data (synlige objekter, egenskaper, valg) når siden faktisk kjører som et iframe inni Trimble Connect — lokalt får du bare bekreftet at koden laster uten feil.

## Prosjektstruktur

```
index.html    – markup og styling
app.js        – all logikk (henting, filtrering, tabell, valg/zoom, viewer-sync)
manifest.json – Trimble Connect extension-manifest
icon.svg      – ikon (forstørrelsesglass + bøyle, formkode 21)
vendor/       – lokal kopi av trimble-connect-workspace-api (IIFE-bygg)
```
