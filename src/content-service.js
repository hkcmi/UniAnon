export function canAccessSpace(user, space) {
  if (!space) {
    return false;
  }

  if (space.allowed_domains.length === 0) {
    return true;
  }

  return Boolean(user && space.allowed_domains.includes(user.domain_group));
}

export function createContentService(store) {
  function createPost({ user, spaceId = 'public', content }) {
    const space = store.spaces.get(spaceId);
    if (!canAccessSpace(user, space)) {
      return {
        ok: false,
        status: 403,
        error: 'space_access_denied'
      };
    }

    return {
      ok: true,
      status: 201,
      post: store.createPost(user.user_hash, space.id, content)
    };
  }

  function listVisiblePosts({ user = null, spaceId = null } = {}) {
    return [...store.posts.values()]
      .filter((post) => !post.hidden)
      .filter((post) => !spaceId || post.space_id === spaceId)
      .filter((post) => canAccessSpace(user, store.spaces.get(post.space_id)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  function createComment({ user, postId, content }) {
    const post = store.posts.get(postId);
    if (!post || post.hidden) {
      return {
        ok: false,
        status: 404,
        error: 'post_not_found'
      };
    }

    return {
      ok: true,
      status: 201,
      comment: store.createComment(post.id, user.user_hash, content)
    };
  }

  return {
    createPost,
    listVisiblePosts,
    createComment
  };
}
