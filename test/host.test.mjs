import { RoomHost, ROUNDS_PER_MATCH } from '../src/game/host.js';

function createInbox() {
  const messages = [];
  return { messages, sendMessage: (message) => messages.push(message) };
}

function must(condition, description) {
  if (!condition) {
    throw new Error(description);
  }
}

function lastMessageOfType(inbox, type) {
  return [...inbox.messages].reverse().find((message) => message.type === type);
}

{
  const room = new RoomHost();
  const anaInbox = createInbox();
  const biaInbox = createInbox();
  const caioInbox = createInbox();
  const ana = room.join(anaInbox.sendMessage, { name: 'Ana' });
  must(
    anaInbox.messages[0].type === 'welcome' && anaInbox.messages[0].phase === 'lobby' && anaInbox.messages[0].hostId === ana.id,
    'welcome puts the first player in the lobby as host'
  );
  const bia = room.join(biaInbox.sendMessage, { name: 'Bia<>' });
  must(biaInbox.messages[0].players.length === 2, 'welcome lists the players');
  must(
    anaInbox.messages.some((message) => message.type === 'join' && message.player.name === 'Bia'),
    'join is broadcast and names are sanitized'
  );
  must(room.phase === 'lobby', 'a match never starts by itself');

  room.receive(bia, { type: 'startMatch', modeId: 'tag' });
  must(room.phase === 'lobby', 'guests cannot start the match');
  room.receive(ana, { type: 'startMatch', modeId: 'tag' });
  must(room.phase === 'play' && room.roundNumber === 1, 'host starts round 1');
  const startMessage = lastMessageOfType(anaInbox, 'start');
  must(startMessage.roundNumber === 1 && startMessage.totalRounds === ROUNDS_PER_MATCH, 'start carries the round numbers');

  const [chaser, runner] = startMessage.itPlayerId === ana.id ? [ana, bia] : [bia, ana];
  chaser.position = { x: 0, y: 0, z: 0 };
  runner.position = { x: 1, y: 0, z: 0 };
  chaser.stunnedUntil = 0;
  room.receive(chaser, { type: 'tag', targetId: runner.id });
  must(room.itPlayerId === runner.id, 'tagging passes IT');

  for (let roundNumber = 1; roundNumber <= ROUNDS_PER_MATCH; roundNumber++) {
    must(room.roundNumber === roundNumber && room.phase === 'play', `round ${roundNumber} is running`);
    ana.score = 10;
    bia.score = 3;
    room.endRound();
    const endMessage = lastMessageOfType(anaInbox, 'end');
    must(endMessage.winnerIds.length === 1 && endMessage.winnerIds[0] === ana.id, 'round winner is the top scorer');
    if (roundNumber < ROUNDS_PER_MATCH) {
      must(room.phase === 'break' && !endMessage.final, 'break between rounds');
      room.startRound();
    }
  }
  must(room.phase === 'podium', 'the podium follows the last round');
  const finalMessage = lastMessageOfType(anaInbox, 'end');
  must(
    finalMessage.final && finalMessage.podium[0].id === ana.id && finalMessage.podium[0].wins === ROUNDS_PER_MATCH,
    'podium is ordered by round wins'
  );
  must(finalMessage.podium[1].wins === 0, 'second place has no wins');

  const caio = room.join(caioInbox.sendMessage, { name: 'Caio' });
  must(room.phase === 'podium', 'joining does not interrupt the podium');
  room.receive(bia, { type: 'toLobby' });
  must(room.phase === 'podium', 'guests cannot return to the lobby');
  room.receive(ana, { type: 'toLobby' });
  must(room.phase === 'lobby', 'host returns to the mode selection');
  room.receive(ana, { type: 'startMatch', modeId: 'tag' });
  must(room.phase === 'play' && room.roundNumber === 1 && ana.wins === 0, 'a new match resets the wins');

  room.leave(bia);
  must(room.phase === 'play', 'with two players the match goes on');
  room.leave(caio);
  must(room.phase === 'podium', 'the last player standing gets the podium');
  const forfeitMessage = lastMessageOfType(anaInbox, 'end');
  must(forfeitMessage.final && forfeitMessage.forfeit && forfeitMessage.podium[0].id === ana.id, 'the survivor wins');
  must(forfeitMessage.podium.slice(1).every((entry) => entry.left), 'players who left appear after the survivor');
  room.receive(ana, { type: 'startMatch', modeId: 'tag' });
  must(room.phase === 'podium', 'a match needs two players');
  room.leave(ana);
  room.stop();
}

{
  const room = new RoomHost();
  let connectionClosed = false;
  room.join(() => {}, { name: 'Host' }, { isHost: true });
  const ghost = room.join(() => {}, { name: 'Ghost' }, { closeConnection: () => (connectionClosed = true) });
  ghost.lastSeenAt = Date.now() - 60000;
  room.tickClock();
  must(connectionClosed && room.players.size === 1, 'silent players are dropped');
  room.stop();
}

{
  const room = new RoomHost();
  const inboxes = [createInbox(), createInbox(), createInbox()];
  const players = inboxes.map((inbox, index) => room.join(inbox.sendMessage, { name: `P${index}` }));
  room.receive(players[0], { type: 'startMatch', modeId: 'potato' });
  must(room.phase === 'play' && room.modeId === 'potato' && room.roundNumber === 1, 'potato: round 1 starts');
  must(room.fuse && room.fuse.totalSeconds >= 9 && room.fuse.totalSeconds <= 22, 'the fuse is random between 9 and 22 seconds');
  must(room.itPlayerId !== null && room.remainingSeconds === 0, 'someone holds the potato and there is no clock');
  const startMessage = lastMessageOfType(inboxes[0], 'start');
  must(startMessage.fuse && startMessage.eliminatedIds.length === 0, 'start carries the fuse');

  const currentHolder = () => players.find((player) => player.id === room.itPlayerId);
  let holder = currentHolder();
  const others = players.filter((player) => player !== holder);
  holder.stunnedUntil = 0;
  holder.position = { x: 0, y: 0, z: 0 };
  for (const other of others) {
    other.position = { x: 1, y: 0, z: 0 };
    other.immuneUntil = 0;
  }
  const fuseEndsAt = room.fuse.endsAt;
  room.receive(others[0], { type: 'tag', targetId: holder.id });
  must(room.itPlayerId === holder.id, 'only the holder can pass the potato');
  room.receive(holder, { type: 'tag', targetId: others[0].id });
  must(room.itPlayerId === others[0].id && room.fuse.endsAt === fuseEndsAt, 'passing keeps the same fuse');
  room.receive(others[0], { type: 'tag', targetId: holder.id });
  must(room.itPlayerId === others[0].id, 'the passer is immune: the potato cannot bounce back');

  holder = currentHolder();
  holder.position = { x: 3, y: 0, z: 4 };
  room.fuse.endsAt = Date.now() - 1;
  room.stepPotato();
  const boomMessage = lastMessageOfType(inboxes[1], 'boom');
  must(boomMessage && boomMessage.playerId === holder.id && boomMessage.position.x === 3, 'boom says who exploded and where');
  must(!holder.alive && room.itPlayerId === null && room.fuse === null, 'the holder is out and the potato is gone');
  must(lastMessageOfType(inboxes[0], 'tick').eliminatedIds.includes(holder.id), 'ticks list the eliminated');
  room.stepPotato();
  must(room.fuse === null, 'still pausing after the explosion');
  room.nextEventAt = Date.now() - 1;
  room.stepPotato();
  must(room.fuse && room.alivePlayers().some((player) => player.id === room.itPlayerId), 'a new potato goes to a survivor');
  must(room.itPlayerId !== holder.id, 'the eliminated player never gets the potato');

  const survivorsBefore = room.alivePlayers().map((player) => player.id);
  room.fuse.endsAt = Date.now() - 1;
  room.stepPotato();
  room.nextEventAt = Date.now() - 1;
  room.stepPotato();
  const roundEnd = lastMessageOfType(inboxes[0], 'end');
  const winner = players.find((player) => player.alive);
  must(
    roundEnd && roundEnd.winnerIds.length === 1 && roundEnd.winnerIds[0] === winner.id && survivorsBefore.includes(winner.id),
    'the last survivor wins the round'
  );
  must(winner.wins === 1 && room.phase === 'break', 'the win is counted and the break begins');
  room.startRound();
  must(room.alivePlayers().length === 3 && room.roundNumber === 2 && room.fuse, 'next round: everyone alive, new potato');

  const leavingHolder = players.find((player) => player.id === room.itPlayerId);
  room.leave(leavingHolder);
  must(room.itPlayerId !== leavingHolder.id && room.itPlayerId !== null && room.fuse, 'if the holder leaves the potato moves on');
  room.stop();
}

console.log('room ok');
