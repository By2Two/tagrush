import { useEffect, useRef } from 'react';
import { MenuStage } from '../game/stage.js';
import { PLAYER_COLORS } from '../game/map.js';
import LeftColumn from './LeftColumn.jsx';
import SidePanel from './SidePanel.jsx';

function StageViewport({ stageRef, profile }) {
  const dragRef = useRef({ lastX: null, moved: false });
  const playerName = profile.name.trim() || 'Runner';

  const startDrag = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { lastX: event.clientX, moved: false };
  };

  const continueDrag = (event) => {
    const { lastX } = dragRef.current;
    if (lastX === null) {
      return;
    }
    const deltaX = event.clientX - lastX;
    if (deltaX) {
      dragRef.current.moved = true;
    }
    stageRef.current?.rotate(deltaX);
    dragRef.current.lastX = event.clientX;
  };

  const endDrag = (event) => {
    if (event.type === 'pointerup' && !dragRef.current.moved) {
      stageRef.current?.punch();
    }
    dragRef.current.lastX = null;
    stageRef.current?.rotate(null);
  };

  return (
    <div
      className="start-center"
      title="Drag to rotate, click to punch"
      onPointerDown={startDrag}
      onPointerMove={continueDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="stage-label">
        <small>{profile.sessionKind === 'solo' ? 'Solo' : 'Online'}</small>
        {playerName}
      </span>
    </div>
  );
}

export default function Menu({
  profile,
  onProfileChange,
  settings,
  onSettingsChange,
  onStartSession,
  errorMessage,
  invitedRoomCode,
  hostedRoom,
  onHostRoom,
  onCancelHosting,
}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => {
    const stage = new MenuStage(canvasRef.current, PLAYER_COLORS[0]);
    stageRef.current = stage;
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  return (
    <div className="menu">
      <div className="menu-slash" aria-hidden="true" />
      <canvas ref={canvasRef} className="stage-canvas" />
      <div className="start">
        <div className="start-main">
          <LeftColumn
            profile={profile}
            onProfileChange={onProfileChange}
            onStartSession={onStartSession}
            errorMessage={errorMessage}
            invitedRoomCode={invitedRoomCode}
            hostedRoom={hostedRoom}
            onHostRoom={onHostRoom}
            onCancelHosting={onCancelHosting}
          />
        </div>
        <StageViewport stageRef={stageRef} profile={profile} />
        <SidePanel settings={settings} onSettingsChange={onSettingsChange} />
      </div>
    </div>
  );
}
