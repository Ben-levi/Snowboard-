export default function Avatar({ member, size = 36 }) {
  return (
    <span
      className="avatar"
      style={{ background: member?.color ?? '#adb5bd', width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      {(member?.name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}
