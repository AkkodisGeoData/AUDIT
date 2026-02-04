# 🌊 AUDIT - Plateforme Cartographique Offshore (OpenLayers)

**AUDIT** est une application web interactive conçue pour la visualisation et l'analyse des infrastructures éoliennes en mer, des réseaux de câbles et des données bathymétriques. Propulsée par le moteur **OpenLayers**, elle offre une précision géographique rigoureuse et une gestion fluide des données massives.

📍 **Accès direct à l'application :** [https://akkodisgeodata.github.io/AUDIT/](https://akkodisgeodata.github.io/AUDIT/)

---

## 🚀 Fonctionnalités Clés

### 🗺️ Cartographie Haute Performance (OpenLayers)
* **Moteur OpenLayers** : Rendu vectoriel optimisé pour les jeux de données complexes.
* **Infrastructures Offshore** : Visualisation des turbines, stations (OSS) et connecteurs avec gestion d'échelle.
* **Réseaux de Câbles** : Couches distinctes pour les câbles inter-éoliennes et d'exportation.
* **Système de Projections** : Support natif des coordonnées géographiques pour une précision métrique.

### ⚓ Bathymétrie & Topographie Marine
* Affichage des contours de profondeur.
* **Optimisation** : Fichier JSON optimisé à 90 Mo pour un rendu fluide sans surcharge du processeur.

### 🌦️ Météo & Conditions de Vent
* Intégration de l'API **OpenWeatherMap**.
* Recherche par ville avec retour dynamique sur la vitesse du vent, la direction et les conditions de sécurité pour les opérations offshore.

### 🔍 Recherche & Navigation
* Moteur de recherche intégré pour localiser instantanément les actifs par leur identifiant ou nom.
* Contrôles de zoom et de navigation personnalisés.

---

## 🛠️ Technologies Utilisées

* **Moteur Cartographique** : [OpenLayers 7+](https://openlayers.org/)
* **Interface** : HTML5, CSS3 
* **Logique** : JavaScript ES6+
* **Gestion des données** : Mapshaper & GeoJSON
* **Déploiement** : GitHub Pages via GitHub Desktop

---


## 📁 Structure du Projet

```text
├── index.html          # Structure et conteneur de la carte
├── script.js           # Logique OpenLayers (Map, View, Layers)
├── style.css           # Mise en page et responsive design
├── data/               # GeoJSON (Bathymétrie, Parcs, Câbles)
└── symbols/            # Assets graphiques (SVG/PNG)