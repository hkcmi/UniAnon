export function createContentViewService(store) {
  function serializeComment(comment) {
    const commentUser = store.users.get(comment.user_hash);
    return {
      id: comment.id,
      post_id: comment.post_id,
      nickname: commentUser?.nickname || '[deleted]',
      content: comment.content,
      created_at: comment.created_at
    };
  }

  function serializePost(post) {
    const user = store.users.get(post.user_hash);
    const comments = [...store.comments.values()]
      .filter((comment) => comment.post_id === post.id && !comment.hidden)
      .map(serializeComment);

    return {
      id: post.id,
      space_id: post.space_id,
      nickname: user?.nickname || '[deleted]',
      content: post.content,
      created_at: post.created_at,
      comments
    };
  }

  return {
    serializeComment,
    serializePost
  };
}
