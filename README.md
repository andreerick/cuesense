# CueSense

Une application web d'une seule page qui transforme un **capteur de mouvement WitMotion
Bluetooth** fixé sur une queue de snooker/billard en **analyseur de gestuelle**. Elle lit
en direct le flux du capteur via Web Bluetooth, détecte chaque coup et mesure la mécanique
et la régularité de la délivrance — vitesse, tempo, rectitude et répétabilité.

L'application est en HTML/CSS/JS pur — quelques fichiers statiques à plat, sans étape de
build, sans dépendances, sans backend. [`index.html`](index.html) charge une feuille de
style et cinq petits scripts classiques (pas de modules ES), donc elle fonctionne aussi
ouverte directement en `file://`. L'interface est en français.

L'interface suit l'architecture validée dans [`PROJECT.md`](PROJECT.md) : cinq onglets —
**Joueur** (identification), **Connexion** (capteur + batterie), **Calibrage**
(vérification 3 s de l'horizontale + axe de la queue), **Exercices** (calibrage des coups
+2…−2, vitesse du geste, répétabilité) et **Résultats** (tableaux, graphiques, exports).

> **CueSense** · `Analyse du geste au snooker` · `WitMotion BLE`

## Ce que ça fait

Clipsez une centrale inertielle WitMotion (accéléromètre + gyroscope + orientation) sur
votre queue, connectez-la dans le navigateur et enchaînez les coups d'entraînement. Pour
chaque coup, l'application extrait :

| Mesure | Ce qu'elle indique |
|---|---|
| **Vitesse à l'impact** (m/s) | Vitesse de la queue au contact, intégrée depuis l'accélération sur l'axe de la queue |
| **Pic d'accélération** (g) | Netteté du contact |
| **Tempo** — backswing · pause · délivrance (ms) | Le rythme du coup, décomposé en phases |
| **Ratio back/délivrance** | Fluidité du passage à travers la bille |
| **Déviation latérale** (%) | À quel point la queue part sur le côté au lieu d'aller droit |
| **Dérive angulaire** (°) | Rotation/roulis de la queue pendant la délivrance |

Sur l'ensemble d'une session, elle affiche **moyenne ± écart-type et coefficient de
variation** pour chaque mesure — les chiffres qui comptent vraiment pour une gestuelle
répétable. Si vous saisissez la distance parcourue par la bille blanche à chaque coup, elle
trace aussi **vitesse à l'impact ↔ distance** et ajuste une courbe `d ≈ k·v²`, faisant
ressortir les points aberrants (mauvais contacts, contacts irréguliers).

### Comment le capteur est lu

- **En direct via Web Bluetooth.** Se connecte à un appareil WitMotion BLE (préfixes de nom
  `WT`, `BWT`, `HC`), active les notifications, puis déverrouille et règle la fréquence de
  sortie à la connexion. Fréquences disponibles : **10 / 50 / 100 / 200 Hz**.
- **Protocole.** Décode les trames WitMotion de 20 octets (en-tête `0x55 0x61`) en
  accélération (±16 g), vitesse angulaire (±2000 °/s) et angles d'Euler (roll/pitch/yaw,
  ±180°).
- **Détection automatique de l'axe de la queue.** L'application détermine quel axe du capteur
  pointe dans l'axe de la queue en choisissant celui qui a le plus de variance de mouvement,
  avec une option de **calibration** de 2 secondes (quelques coups d'entraînement pour le
  verrouiller).
- **Détection des coups.** Un coup est déclenché lorsque l'amplitude de l'accélération
  dépasse un seuil réglable (0,8 g par défaut), avec une fenêtre réfractaire pour éviter les
  doubles comptages.

### Quatre façons de travailler les données

1. **Capteur en direct** — connexion et graphiques en temps réel (nécessite Web Bluetooth).
2. **Enregistrement CSV** — démarrez/arrêtez l’acquisition pour sauvegarder les échantillons
   horodatés (accélération, gyroscope et angles) dans un fichier réimportable.
3. **Import de fichier** — chargez un enregistrement `.csv`/`.tsv`/`.txt` exporté depuis
   l'application mobile **WITMOTION**. Les en-têtes sont détectés automatiquement ; à défaut,
   l'ordre de colonnes par défaut de WitMotion et une fréquence saisie à la main sont
   utilisés s'il n'y a pas de colonne temps.
4. **Démo** — une session synthétique, pratique pour explorer l'interface sans matériel.

Les résultats peuvent être exportés en **JSON** (`cuesense-coups.json`). Chaque coup reçoit
aussi un **score CueSense sur 100**, fondé sur sa rectitude, sa fluidité, sa stabilité
angulaire et sa régularité par rapport à la séance.

La séance en cours (coups, réglages, exercice) est **sauvegardée localement** dans le
navigateur (`localStorage`) : elle survit à un rafraîchissement et à la fermeture de
l'onglet, et se restaure automatiquement à l'ouverture. Le bouton **Effacer** repart d'une
séance vierge. Rien ne quitte l'appareil — il n'y a pas de serveur.

## Compatibilité des navigateurs

Web Bluetooth est requis pour le capteur en direct et n'est disponible que dans
**Chrome/Edge sur ordinateur et Android**. Il n'est **pas** disponible dans Safari sur
iOS/macOS.

- **iPhone :** ouvrez la page dans **[Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055)**
  pour la capture en direct, **ou** enregistrez dans l'app WITMOTION et importez le fichier
  exporté.
- **Sans Bluetooth :** utilisez l'import de fichier ou la démo — les deux fonctionnent dans
  n'importe quel navigateur moderne.

## Lancer en local

Ce sont de simples fichiers statiques — il suffit d'ouvrir la page :

```bash
git clone https://github.com/YohannParis/cuesense.git
cd cuesense
open index.html
```

Pour le Bluetooth en direct, certains navigateurs exigent un contexte sécurisé (`https://`
ou `localhost`) ; il peut donc être utile de le servir :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Déploiement

L'application est déployée sur **https://yohann.paris** automatiquement via GitHub Actions.

### Déploiement automatique

Le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) s'exécute à
chaque push sur `main` (et peut être lancé manuellement depuis l'onglet **Actions**). Il
rassemble les fichiers du site (tout sauf `.github/`, `.claude/` et les `.md`) puis les
envoie sur le serveur en **SFTP** via
[`wlixcc/SFTP-Deploy-Action`](https://github.com/wlixcc/SFTP-Deploy-Action), dans le dossier
du site configuré par les secrets ci-dessous. Les fichiers de l'app restent volontairement
**à plat** (pas de sous-dossiers) : l'utilisateur de déploiement est chrooté et l'action ne
crée pas de répertoires distants.

`sftp_only: true` est indispensable — l'utilisateur de déploiement est restreint au SFTP
(voir ci-dessous), l'action ne doit donc pas ouvrir de shell SSH.

### Secrets GitHub requis

À définir dans **Settings → Secrets and variables → Actions** (les valeurs restent dans les
secrets, jamais dans le dépôt) :

| Secret | Contenu |
|---|---|
| `SFTP_HOST` | hôte du serveur |
| `SFTP_PORT` | port SFTP (généralement `22`) |
| `SFTP_USERNAME` | utilisateur de déploiement restreint au SFTP |
| `SFTP_PASSWORD` | mot de passe de cet utilisateur |
| `SFTP_REMOTE_DIR` | dossier de destination *à l'intérieur* de la prison chroot |

`SFTP_PRIVATE_KEY` est laissé vide — l'action bascule alors sur l'authentification par mot
de passe.

### Configuration du serveur (une seule fois)

Le serveur utilise un utilisateur dédié et verrouillé, restreint au SFTP, qui ne peut écrire
que dans le dossier du site. Le principe :

```
<prison-chroot>/               root:root              ← doit rester propriété de root
└── <dossier-du-site>/         <user>:<groupe-sftp>   ← dossier accessible en écriture (= SFTP_REMOTE_DIR dans la prison)
    └── index.html
```

- L'utilisateur de déploiement n'a pas de shell (`/usr/sbin/nologin`) et est enfermé
  (chroot) dans le répertoire de la prison via un bloc `Match` dans un fichier
  `/etc/ssh/sshd_config.d/`, avec `ForceCommand internal-sftp` et l'authentification par
  mot de passe activée pour ce seul utilisateur.
- Le répertoire de la prison chroot doit appartenir à `root` et ne pas être accessible en
  écriture au groupe ni aux autres ; le sous-dossier du site (et les fichiers qu'il
  contient) doit appartenir à l'utilisateur de déploiement.

## Structure du projet

```
cuesense/
├── index.html                    # structure des cinq écrans + barre d'onglets
├── cuesense.css                  # charte graphique CueSense (voir PROJECT.md)
├── state.js                      # état partagé, constantes, utilitaires
├── charts.js                     # tracés canvas
├── analysis.js                   # analyse des coups + score CueSense
├── sensor.js                     # Web Bluetooth WitMotion + batterie
├── data.js                       # import CSV, exports, démo
├── app.js                        # navigation, écrans, exercices, résultats
├── PROJECT.md                    # architecture validée + maquettes
├── README.md
└── .github/workflows/deploy.yml  # déploiement SFTP automatique
```

## Auteur

[YohannParis](https://github.com/YohannParis)
