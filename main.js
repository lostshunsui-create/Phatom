// main.js - carregamento e renderização de posts públicos (posts.json) e integração com localStorage
// Não altera posts.json no servidor; apenas lê e renderiza.
// Use junto com index.html que contém o markup (#posts, #folderList, etc.)

const PUBLIC_POSTS_URL = 'posts.json';
let publicBlog = { posts: [], folders: [] };

// Carrega posts públicos (posts.json). Não grava nada no servidor.
async function loadPublicBlog() {
  try {
    const res = await fetch(PUBLIC_POSTS_URL, { cache: 'no-cache' });
    if (!res.ok) {
      // se não existir, mantemos o publicBlog vazio
      console.warn('posts.json não encontrado ou não acessível:', res.status);
      publicBlog = { posts: [], folders: [] };
      return;
    }
    const data = await res.json();
    publicBlog = { posts: data.posts || [], folders: data.folders || [] };
    // normalize para formato esperado: post.media deve ser array de {url, mediaType}
    function normalizePost(p) {
      if (!p) return p;
      if (p.media && !Array.isArray(p.media)) {
        p.media = [{ url: p.media, mediaType: p.mediaType || '' }];
        delete p.mediaType;
      } else if (!p.media) {
        p.media = [];
      }
      return p;
    }
    publicBlog.posts = publicBlog.posts.map(normalizePost);
    publicBlog.folders = (publicBlog.folders || []).map(f => {
      f.posts = (f.posts || []).map(normalizePost);
      return f;
    });
  } catch (err) {
    console.error('Erro ao carregar posts públicos:', err);
    publicBlog = { posts: [], folders: [] };
  }
}

// localStorage helpers (mantêm comportamento do painel admin)
function getBlog() {
  let data = localStorage.getItem('phantomtrace_blog');
  if (!data) {
    const obj = { posts: [], folders: [] };
    localStorage.setItem('phantomtrace_blog', JSON.stringify(obj));
    return obj;
  }
  const blog = JSON.parse(data);
  // normaliza posts antigos
  function normalizePost(p) {
    if (!p) return p;
    if (p.media && !Array.isArray(p.media)) {
      p.media = [{ url: p.media, mediaType: p.mediaType || '' }];
      delete p.mediaType;
    } else if (!p.media) {
      p.media = [];
    }
    return p;
  }
  blog.posts = (blog.posts || []).map(normalizePost);
  blog.folders = (blog.folders || []).map(f => {
    f.posts = (f.posts || []).map(normalizePost);
    return f;
  });
  return blog;
}
function setBlog(obj) {
  localStorage.setItem('phantomtrace_blog', JSON.stringify(obj));
}

// render de mídia para uso tanto na listagem pública quanto no painel
function renderMediaForPost(post) {
  if (!post) return '';
  const medias = Array.isArray(post.media) ? post.media : (post.media ? [{ url: post.media, mediaType: post.mediaType || '' }] : []);
  if (!medias.length) return '';
  return medias.map(m => {
    if (!m || !m.url) return '';
    const url = m.url;
    const type = (m.mediaType || '').toLowerCase();
    if (type.startsWith('image/') || url.match(/\.(png|jpe?g|gif|webp)(\?.*)?$/i)) {
      return `<img class="media" src="${url}" alt="imagem">`;
    }
    if (type.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) {
      return `<video class="media" controls src="${url}"></video>`;
    }
    if (type.startsWith('audio/') || url.match(/\.(mp3|wav|ogg)(\?.*)?$/i)) {
      return `<audio class="media" controls src="${url}"></audio>`;
    }
    if (type === 'application/pdf' || url.match(/\.pdf(\?.*)?$/i)) {
      return `<a class="media" href="${url}" target="_blank">Ver PDF</a>`;
    }
    return `<a class="media" href="${url}" target="_blank">Abrir arquivo</a>`;
  }).join('');
}

// Renderiza posts na área #posts, mesclando públicos + locais.
// Se desejar alterar a área alvo, chame renderPosts('#meuContainer')
function renderPosts(containerSelector = '#posts') {
  const postSection = document.querySelector(containerSelector);
  if (!postSection) return;
  postSection.innerHTML = '';
  const blog = getBlog();
  let posts = [];
  // se uma pasta estiver selecionada (global selectedFolder no index), usa ela
  const selectedFolder = window.selectedFolder || '';
  if (selectedFolder !== '') {
    const publicFolder = (publicBlog.folders || []).find(ff => ff.title === selectedFolder);
    const localFolder = (blog.folders || []).find(ff => ff.title === selectedFolder);
    posts = [...(publicFolder?.posts || []), ...(localFolder?.posts || [])];
  } else {
    posts = [...(publicBlog.posts || []), ...(blog.posts || [])];
  }
  posts.slice().reverse().forEach(post => {
    const mediaHtml = renderMediaForPost(post);
    postSection.insertAdjacentHTML('beforeend', `
      <div class="post">
        <div class="post-title">${escapeHtml(post.title || '')}</div>
        <div class="post-date">${escapeHtml(post.date || '')}${post.folder?` • <span class="folder-title">${escapeHtml(post.folder)}</span>`:""}</div>
        <div class="post-content">${escapeHtml(post.content || '')}</div>
        ${mediaHtml}
      </div>
    `);
  });
}

// Renderiza botões de pasta em #folderList (mescla public + local)
function renderFolders() {
  const folderListEl = document.getElementById('folderList');
  if (!folderListEl) return;
  const local = getBlog().folders || [];
  const publicTitles = (publicBlog.folders || []).map(f => f.title);
  const localTitles = local.map(f => f.title);
  const all = Array.from(new Set([...publicTitles, ...localTitles]));
  if (all.length) {
    let html = '<span class="folder-title">Pastas / Páginas:</span><br>';
    all.forEach(title => {
      html += `<button class="folder-btn" onclick="selectFolder('${escapeAttr(title)}')">${escapeHtml(title)}</button>`;
    });
    html += `<button class="folder-btn" onclick="selectFolder('')">Livre</button>`;
    folderListEl.innerHTML = html;
  } else {
    folderListEl.innerHTML = '';
  }
}

// helper: monta objeto mesclado público+local (usado pelo export/publish)
function buildExportableBlog() {
  const local = getBlog();
  const merged = { posts: [], folders: [] };
  merged.posts = [...(publicBlog.posts || []).map(p => ({ ...p })), ...(local.posts || []).map(p => ({ ...p }))];
  const folderMap = new Map();
  (publicBlog.folders || []).forEach(f => {
    folderMap.set(f.title, { title: f.title, posts: Array.isArray(f.posts) ? f.posts.map(p => ({ ...p })) : [] });
  });
  (local.folders || []).forEach(f => {
    if (folderMap.has(f.title)) {
      folderMap.get(f.title).posts = [...folderMap.get(f.title).posts, ...(f.posts || []).map(p => ({ ...p }))];
    } else {
      folderMap.set(f.title, { title: f.title, posts: Array.isArray(f.posts) ? f.posts.map(p => ({ ...p })) : [] });
    }
  });
  merged.folders = Array.from(folderMap.values());
  return merged;
}

// small sanitizers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function escapeAttr(str){
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// expose some functions to global scope used by index.html
window.loadPublicBlog = loadPublicBlog;
window.renderPosts = renderPosts;
window.renderFolders = renderFolders;
window.getBlog = getBlog;
window.setBlog = setBlog;
window.buildExportableBlog = buildExportableBlog;
window.renderMediaForPost = renderMediaForPost;

// convenience: load public and render on script load
loadPublicBlog().then(() => {
  renderFolders();
  renderPosts();
});