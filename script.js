/**
 * 图片压缩工具的主要功能实现
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const previewSection = document.getElementById('previewSection');
    const imagesContainer = document.getElementById('imagesContainer');
    const compressBtn = document.getElementById('compressBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    let imageQueue = [];
    let isProcessing = false;

    // 拖拽上传
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#007AFF';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#ddd';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#ddd';
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 200) {
            alert('一次最多只能选择200张图片！');
            return;
        }
        handleFiles(files);
    });

    // 文件选择
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 200) {
            alert('一次最多只能选择200张图片！');
            return;
        }
        handleFiles(files);
    });

    /**
     * 处理上传的文件
     * @param {File[]} files - 用户上传的图片文件数组
     */
    function handleFiles(files) {
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            alert('请上传图片文件！');
            return;
        }

        imageQueue = imageFiles;
        previewSection.style.display = 'block';
        
        // 清空并重新生成预览容器
        imagesContainer.innerHTML = '';
        
        // 为每个图片创建预览
        imageFiles.forEach((file, index) => {
            const previewHTML = `
                <div class="preview-container">
                    <div class="preview-box">
                        <h3>原图 ${index + 1}</h3>
                        <div class="image-container">
                            <img id="originalImage${index}" alt="原图预览">
                        </div>
                        <div class="file-info">
                            <span>文件大小：</span>
                            <span id="originalSize${index}">${formatFileSize(file.size)}</span>
                        </div>
                    </div>
                    
                    <div class="preview-box">
                        <h3>压缩后 ${index + 1}</h3>
                        <div class="image-container">
                            <img id="compressedImage${index}" alt="压缩后预览">
                        </div>
                        <div class="file-info">
                            <span>文件大小：</span>
                            <span id="compressedSize${index}">等待压缩...</span>
                        </div>
                    </div>
                </div>
            `;
            imagesContainer.insertAdjacentHTML('beforeend', previewHTML);
            
            // 显示原图预览
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById(`originalImage${index}`).src = e.target.result;
            };
            reader.readAsDataURL(file);
        });

        compressBtn.textContent = `压缩至300KB (${imageFiles.length}张)`;
        downloadBtn.disabled = true;
    }

    // 压缩按钮事件
    compressBtn.addEventListener('click', async () => {
        if (imageQueue.length === 0 || isProcessing) return;
        
        isProcessing = true;
        compressBtn.disabled = true;
        
        try {
            const zip = new JSZip();
            
            for (let i = 0; i < imageQueue.length; i++) {
                const file = imageQueue[i];
                compressBtn.textContent = `压缩中... (${i + 1}/${imageQueue.length})`;
                
                try {
                    const result = await compressImageOptimal(file);
                    if (result) {
                        document.getElementById(`compressedImage${i}`).src = URL.createObjectURL(result.blob);
                        document.getElementById(`compressedSize${i}`).textContent = 
                            `${formatFileSize(result.blob.size)}${result.wasConverted ? ' (已转换为JPG)' : ''}`;
                        
                        const fileName = `compressed_${file.name.replace(/\.[^/.]+$/, '')}${result.extension}`;
                        zip.file(fileName, result.blob);
                    }
                } catch (error) {
                    console.error('单个文件压缩失败:', error);
                    document.getElementById(`compressedSize${i}`).textContent = '压缩失败';
                }
            }
            
            const zipBlob = await zip.generateAsync({type: 'blob'});
            downloadBtn.disabled = false;
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = 'compressed_images.zip';
                link.click();
            };
        } catch (error) {
            console.error('压缩失败:', error);
            alert('压缩过程中出现错误，请重试');
        } finally {
            compressBtn.textContent = '压缩至300KB';
            compressBtn.disabled = false;
            isProcessing = false;
        }
    });

    /**
     * 压缩图片至接近300KB
     * @param {File} file - 原始图片文件
     */
    async function compressImageOptimal(file) {
        const maxSize = 300 * 1024; // 300KB
        const minSize = 290 * 1024; // 290KB
        let quality = 0.95; // 从高质量开始
        let scale = 1;
        let lastValidBlob = null;
        
        const img = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // 保持原始图片格式
        const outputType = file.type;
        
        while (true) {
            canvas.width = width * scale;
            canvas.height = height * scale;
            
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, outputType, quality);
            });
            
            if (blob.size <= maxSize) {
                if (blob.size >= minSize || quality >= 0.95) {
                    return { 
                        blob,
                        extension: outputType === 'image/png' ? '.png' : '.jpg',
                        wasConverted: false
                    };
                }
                lastValidBlob = blob;
                quality += 0.05;
                if (quality > 0.95) quality = 0.95;
            } else {
                if (quality > 0.1) {
                    quality -= 0.05;
                } else {
                    scale *= 0.9;
                }
            }
            
            if (quality <= 0.1 && scale <= 0.1) {
                // 如果PNG压缩效果不理想，尝试转换为JPEG
                if (outputType === 'image/png') {
                    const jpegBlob = await new Promise(resolve => {
                        canvas.toBlob(resolve, 'image/jpeg', 0.8);
                    });
                    if (jpegBlob.size <= maxSize) {
                        return {
                            blob: jpegBlob,
                            extension: '.jpg',
                            wasConverted: true
                        };
                    }
                }
                return lastValidBlob ? {
                    blob: lastValidBlob,
                    extension: outputType === 'image/png' ? '.png' : '.jpg',
                    wasConverted: false
                } : null;
            }
        }
    }

    /**
     * 格式化文件大小
     * @param {number} bytes - 文件大小（字节）
     * @returns {string} 格式化后的文件大小
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});