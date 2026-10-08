// File: api/get-drive-images.js

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const folderUrl = String(req.query.folderUrl || '').trim();
    if (!folderUrl) return res.status(400).json({ error: 'Missing folderUrl parameter' });

    const extractFolderInfo = (url) => {
        const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]+)/);
        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const resourceKeyMatch = url.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i);
        return {
            id: folderMatch?.[1] || idMatch?.[1] || null,
            resourceKey: resourceKeyMatch?.[1] || null
        };
    };

    const { id: folderId, resourceKey } = extractFolderInfo(folderUrl);
    if (!folderId) return res.status(400).json({ error: 'Không tìm thấy ID thư mục trong link.' });

    const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;

    if (!API_KEY) return res.status(503).json({ error: "Missing GOOGLE_DRIVE_API_KEY" });

    const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        pageSize: '1000',
        orderBy: 'name',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
        fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,size,videoMediaMetadata,shortcutDetails)'
    });

    params.set('key', API_KEY);

    try {
        const headers = {};

        if (resourceKey) {
            headers['X-Goog-Drive-Resource-Keys'] = `${folderId}/${resourceKey}`;
        }

        const allFiles = [];
        let pageToken = '';

        for (let page = 0; page < 10; page += 1) {
            const pageParams = new URLSearchParams(params);

            if (pageToken) {
                pageParams.set('pageToken', pageToken);
            }

            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?${pageParams.toString()}`,
                { headers }
            );

            const data = await response.json();

            if (!response.ok || data.error) {
                console.error('Google API Error:', data.error || data);

                return res.status(response.status || 500).json({
                    error:
                        'Lỗi từ Google Drive API: ' +
                        (data.error?.message || 'Không thể đọc thư mục Drive.')
                });
            }

            allFiles.push(...(data.files || []));

            pageToken = data.nextPageToken || '';

            if (!pageToken) break;
        }

        const isVideoName = (name = '') =>
            /\.(mp4|webm|mov|m4v|avi|mkv|ogg)$/i.test(name);

        const isImageName = (name = '') =>
            /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name);

        const isVideoMime = (mime = '') =>
            mime.startsWith('video/');

        const isImageMime = (mime = '') =>
            mime.startsWith('image/');

        const isShortcut = (mime = '') =>
            mime === 'application/vnd.google-apps.shortcut';

        async function getFileById(id) {
            const fileParams = new URLSearchParams({
                fields:
                    'id,name,mimeType,thumbnailLink,webContentLink,webViewLink,size,videoMediaMetadata,shortcutDetails',
                supportsAllDrives: 'true'
            });

            fileParams.set('key', API_KEY);

            const targetHeaders = {};

            if (resourceKey) {
                targetHeaders['X-Goog-Drive-Resource-Keys'] =
                    `${id}/${resourceKey}`;
            }

            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${fileParams.toString()}`,
                { headers: targetHeaders }
            );

            const data = await response.json();

            if (!response.ok || data.error) {
                return null;
            }

            return data;
        }

        const mediaFiles = [];

        for (const originalFile of allFiles) {
            let file = originalFile;

            let sourceId = originalFile.id;
            let sourceName = originalFile.name || '';
            let sourceMime = originalFile.mimeType || '';

            let isShortcutFile = false;

            /*
             * Google Drive shortcuts can point to real video/image files.
             * Resolve the target so the frontend receives the real media ID + MIME type.
             */
            if (
                isShortcut(sourceMime) &&
                originalFile.shortcutDetails?.targetId
            ) {
                isShortcutFile = true;

                const target = await getFileById(
                    originalFile.shortcutDetails.targetId
                );

                if (target) {
                    file = {
                        ...target,
                        name: sourceName || target.name
                    };
                } else {
                    /*
                     * Even without target metadata,
                     * targetMimeType is enough to flag a clip/image.
                     */
                    file = {
                        ...originalFile,
                        id: originalFile.shortcutDetails.targetId,
                        mimeType:
                            originalFile.shortcutDetails.targetMimeType || '',
                        name: sourceName
                    };
                }

                sourceId = file.id;
                sourceName = file.name || sourceName;
                sourceMime = file.mimeType || sourceMime;
            }

            const isVideo =
                isVideoMime(sourceMime) ||
                isVideoName(sourceName) ||
                (
                    isShortcutFile &&
                    isVideoMime(
                        originalFile.shortcutDetails?.targetMimeType || ''
                    )
                );

            const isImage =
                isImageMime(sourceMime) ||
                isImageName(sourceName) ||
                (
                    isShortcutFile &&
                    isImageMime(
                        originalFile.shortcutDetails?.targetMimeType || ''
                    )
                );

            if (!isVideo && !isImage) continue;

            const driveThumbUrl =
                `https://drive.google.com/thumbnail?id=${encodeURIComponent(sourceId)}&sz=w1600`;

            const highResUrl =
                file.thumbnailLink
                    ? file.thumbnailLink.replace(/=s\d+$/, '=s2000')
                    : driveThumbUrl;

            const viewUrl =
                file.webViewLink ||
                `https://drive.google.com/file/d/${sourceId}/view`;

            const previewUrl =
                `https://drive.google.com/file/d/${sourceId}/preview`;

            mediaFiles.push({
                id: sourceId,
                name: sourceName,
                mimeType: sourceMime,

                isVideo,
                isShortcut: isShortcutFile,

                thumb:
                    highResUrl ||
                    file.thumbnailLink ||
                    driveThumbUrl,

                url:
                    isVideo
                        ? viewUrl
                        : (
                            highResUrl ||
                            file.webContentLink ||
                            viewUrl
                        ),

                previewUrl:
                    isVideo
                        ? previewUrl
                        : viewUrl,

                webViewLink: viewUrl,

                webContentLink:
                    file.webContentLink || '',

                size:
                    file.size || '',

                videoMediaMetadata:
                    file.videoMediaMetadata || null,

                source: 'drive'
            });
        }

        return res.status(200).json({
            success: true,
            folderId,
            count: mediaFiles.length,
            images: mediaFiles
        });

    } catch (error) {
        console.error('Fetch Error:', error);

        return res.status(500).json({
            error: 'Lỗi server khi gọi Google API Drive.'
        });
    }
}
