# Tag-Rush

First-person multiplayer tag with parkour (Three.js + React).

## Play

The game is a static site (GitHub Pages friendly). There is no game server to run:

1. Open the site and click **Host a room**. Your browser creates the room and shows a **code** and an **invite link**.
2. Send the link (or the code) to your friends. They click it (or use **Join a room**) and connect directly to you over WebRTC.
3. Click **Enter game**. A round starts when 2+ players are in the room (up to 12). 150 s per round; staying free earns 1 point/s.

The host's browser runs the room, so the host must keep the tab open and visible. If the host leaves, the room closes.
**Solo practice** needs no connection at all.

PeerJS's free cloud broker is used only for the initial handshake. Some strict networks (symmetric NAT) need a TURN relay to connect.

```bash
npm install
npm run dev    # http://localhost:5173
npm test
npm run build  # static output in dist/
```

### Deploy to GitHub Pages

Push to `main`; `.github/workflows/deploy.yml` builds and publishes. In the repo settings, set **Pages > Source** to **GitHub Actions**.

## Controls

| Key | Action |
| --- | --- |
| W A S D | move |
| Shift | sprint |
| Space | jump |
| Jump toward a wall (at speed) | wall run |
| Hold Space facing a wall | climb, then mantle the ledge |
| Space while wall running | wall jump |
| C (while sprinting) | slide / crouch |
| Click | tag someone (alternates hands) |
| Tab / R / Esc | scoreboard / respawn / pause |

## Structure

```
src/game/host.js       room rules: rounds, scores, tag and potato logic (no transport)
src/game/modes.js      list of game modes
src/game/p2p.js        WebRTC host session and guest transport (PeerJS)
src/game/Game.js       render loop, input, networking and HUD data
src/game/avatar.js     remote player model, name label, potato on the head
src/game/world.js      builds the map meshes
src/game/minimap.js    minimap drawing
src/game/map.js        map boxes and spawns
src/game/physics.js    movement and collision
src/game/ragdoll.js    explosion ragdoll and blast effects
src/game/potato.js     3D bomb potato
src/components/        menu, HUD, lobby, podium, pause
server/index.js        optional dedicated Node server using the same host.js
test/                  npm test
```

## Code style

`npm run lint` must pass: braces on every `if`, identifiers of at least 3 characters with meaningful names, and no comments.
