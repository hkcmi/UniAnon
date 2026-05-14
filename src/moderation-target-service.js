export function createModerationTargetService(store) {
  function findReportTarget(targetType, targetId) {
    if (targetType === 'post') {
      const post = store.posts.get(targetId);
      return post && !post.hidden ? { exists: true, accusedHash: post.user_hash } : null;
    }

    if (targetType === 'comment') {
      const comment = store.comments.get(targetId);
      return comment && !comment.hidden ? { exists: true, accusedHash: comment.user_hash } : null;
    }

    if (targetType === 'user') {
      const user = store.users.get(targetId);
      return user ? { exists: true, accusedHash: user.user_hash } : null;
    }

    return null;
  }

  function findAppealTarget(targetType, targetId) {
    if (targetType === 'user') {
      const user = store.users.get(targetId);
      return user && user.banned ? { ownerHash: user.user_hash, punished: true } : null;
    }

    if (targetType === 'post') {
      const post = store.posts.get(targetId);
      return post && post.hidden ? { ownerHash: post.user_hash, punished: true } : null;
    }

    if (targetType === 'comment') {
      const comment = store.comments.get(targetId);
      return comment && comment.hidden ? { ownerHash: comment.user_hash, punished: true } : null;
    }

    return null;
  }

  return {
    findReportTarget,
    findAppealTarget
  };
}
