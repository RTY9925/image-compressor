/**
 * 图片压缩工具的主要功能实现
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const imageList = document.getElementById('imageList');
    const compressionProgress = document.getElementById('compressionProgress');
    const progressFill = compressionProgress.querySelector('.progress-fill');
    const progressCount = document.getElementById('progressCount');
    const compressBtn = document.getElementById('compressBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const compressionHistory = document.getElementById('compressionHistory');
    const compress300kBtn = document.getElementById('compress300kBtn');
    const toggleSettings = document.getElementById('toggleSettings');
    const toggleHistory = document.getElementById('toggleHistory');
    const settingsContent = document.getElementById('settingsContent');
    const customSize = document.getElementById('customSize');
    const sizeUnit = document.getElementById('sizeUnit');
    const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
    const selectAll = document.getElementById('selectAll');

    // 设置选项
    const outputFormat = document.getElementById('outputFormat');
    const maxWidth = document.getElementById('maxWidth');
    const maxHeight = document.getElementById('maxHeight');
    const maintainAspectRatio = document.getElementById('maintainAspectRatio');
    const filePrefix = document.getElementById('filePrefix');

    let imageQueue = [];
    let isProcessing = false;

    // 初始化拖拽排序
    new Sortable(imageList, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: (evt) => {
            const items = Array.from(imageList.children);
            imageQueue = items.map(item => imageQueue.find(img => img.id === item.dataset.id));
        }
    });

    // 文件处理函数
    function handleFiles(files) {
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            alert('请上传图片文件！');
            fileInput.value = '';
            return;
        }

        if (imageFiles.length + imageQueue.length > 200) {
            alert('最多只能添加200张图片！');
            fileInput.value = '';
            return;
        }

        imageFiles.forEach(file => {
            const id = Date.now() + Math.random().toString(36).substr(2, 9);
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.className = 'image-item';
                div.dataset.id = id;
                div.innerHTML = `
                    <div class="image-preview">
                        <div class="preview-checkbox">
                            <input type="checkbox" id="check_${id}" class="image-checkbox">
                            <label for="check_${id}"></label>
                        </div>
                        <div class="preview-original">
                            <span class="preview-label">原图</span>
                            <img src="${e.target.result}" alt="原图">
                            <span class="size-info">${formatFileSize(file.size)}</span>
                        </div>
                        <div class="preview-compressed">
                            <span class="preview-label">压缩后</span>
                            <img src="${e.target.result}" alt="压缩预览">
                            <span class="size-info">待压缩</span>
                        </div>
                    </div>
                    <div class="image-info">
                        <div class="image-name">${file.name}</div>
                        <button class="image-item-remove" onclick="removeImage('${id}')">×</button>
                    </div>
                `;
                imageList.appendChild(div);
                
                imageQueue.push({
                    id,
                    file,
                    name: file.name,
                    size: file.size,
                    element: div
                });
                updateButtons();
                updateSelectAllState();
            };

            reader.readAsDataURL(file);
        });

        fileInput.value = '';
    }

    // 移除图片
    window.removeImage = (id) => {
        const item = document.querySelector(`[data-id="${id}"]`);
        if (item) {
            item.remove();
            imageQueue = imageQueue.filter(img => img.id !== id);
            updateButtons();
            updateSelectAllState();
            
            fileInput.value = '';
        }
    };

    // 压缩图片函数
    async function compressImages(mode = 'normal') {
        if (imageQueue.length === 0 || isProcessing) return;
        
        let targetSize;
        const settings = {
            format: outputFormat.value,
            maxWidth: parseInt(maxWidth.value) || null,
            maxHeight: parseInt(maxHeight.value) || null,
            maintainAspectRatio: maintainAspectRatio.checked,
            prefix: filePrefix.value || 'compressed_'
        };

        if (mode === '300k') {
            targetSize = 300 * 1024;
        } else if (mode === 'custom') {
            const size = parseFloat(customSize.value);
            if (!size || size <= 0) {
                alert('请输入有效的目标大小');
                return;
            }
            // 转换单位
            targetSize = size * (sizeUnit.value === 'MB' ? 1024 * 1024 : 1024);
            console.log('目标大小:', targetSize, '字节'); // 添加调试输出
        } else {
            targetSize = 500 * 1024; // 默认500KB
        }
        
        isProcessing = true;
        compressBtn.disabled = true;
        compress300kBtn.disabled = true;
        compressionProgress.style.display = 'block';

        const zip = new JSZip();
        let processed = 0;
        const totalSize = imageQueue.reduce((sum, img) => sum + img.size, 0);
        let compressedSize = 0;

        try {
            for (const image of imageQueue) {
                progressCount.textContent = `${processed + 1}/${imageQueue.length}`;
                progressFill.style.width = `${(processed + 1) * 100 / imageQueue.length}%`;

                let result;
                if (mode === '300k' || mode === 'custom') {
                    result = await smartCompress(image.file, targetSize, settings);
                } else {
                    result = await compressImage(image.file, settings);
                }

                if (result && result.blob) {
                    // 使用设置中的前缀或默认前缀
                    const prefix = settings.prefix.trim() || 'compressed_';
                    const fileName = `${prefix}${image.name.replace(/\.[^/.]+$/, '')}${result.extension}`;
                    zip.file(fileName, result.blob);
                    compressedSize += result.blob.size;

                    // 更新压缩后的预览
                    const previewCompressed = image.element.querySelector('.preview-compressed');
                    const compressedImg = previewCompressed.querySelector('img');
                    const sizeInfo = previewCompressed.querySelector('.size-info');
                    
                    compressedImg.src = URL.createObjectURL(result.blob);
                    sizeInfo.textContent = formatFileSize(result.blob.size);
                }

                processed++;
            }

            const zipBlob = await zip.generateAsync({type: 'blob'});
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = 'compressed_images.zip';
                link.click();
            };
            downloadBtn.disabled = false;

            // 添加到历史记录
            addToHistory(imageQueue.length, totalSize, compressedSize);

        } catch (error) {
            console.error('压缩失败:', error);
            alert('压缩过程中出现错误，请重试');
        } finally {
            isProcessing = false;
            compressBtn.disabled = false;
            compress300kBtn.disabled = false;
            compressionProgress.style.display = 'none';
        }
    }

    // 修改智能压缩函数，添加格式支持
    async function smartCompress(file, targetSize, settings) {
        const maxSize = targetSize;
        const minSize = targetSize * 0.99;
        
        const img = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // 确定输出格式
        let outputType = file.type;
        if (settings.format !== 'original') {
            outputType = `image/${settings.format}`;
        }
        const extension = `.${outputType.split('/')[1]}`;
        
        // 如果原图小于目标大小，直接返回原图
        if (file.size <= maxSize) {
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, outputType, 1.0);
            });
            return {
                blob,
                extension,
                quality: 1.0,
                scale: 1.0
            };
        }

        // 精确控制大小的函数
        async function tryCompress(scale, quality) {
            canvas.width = Math.floor(width * scale);
            canvas.height = Math.floor(height * scale);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            return new Promise(resolve => {
                canvas.toBlob(resolve, outputType, quality);
            });
        }

        // 二分查找最佳参数
        let scaleLeft = 0.1;
        let scaleRight = 1.0;
        let bestResult = null;
        let closestDiff = Number.MAX_VALUE;

        while (scaleRight - scaleLeft > 0.01) {
            const scale = (scaleLeft + scaleRight) / 2;
            let qualityLeft = 0.5;
            let qualityRight = 1.0;

            while (qualityRight - qualityLeft > 0.001) { // 提高质量搜索精度
                const quality = (qualityLeft + qualityRight) / 2;
                const blob = await tryCompress(scale, quality);
                const diff = Math.abs(blob.size - targetSize);

                // 更新最佳结果
                if (diff < closestDiff) {
                    closestDiff = diff;
                    bestResult = {
                        blob,
                        extension,
                        quality,
                        scale
                    };
                }

                // 如果找到完全匹配的结果，直接返回
                if (blob.size === targetSize) {
                    return {
                        blob,
                        extension,
                        quality,
                        scale
                    };
                }

                if (blob.size > targetSize) {
                    qualityRight = quality;
                } else {
                    qualityLeft = quality;
                }
            }

            // 根据最后一次压缩结果调整缩放范围
            const finalBlob = await tryCompress(scale, (qualityLeft + qualityRight) / 2);
            if (finalBlob.size > targetSize) {
                scaleRight = scale;
            } else {
                scaleLeft = scale;
            }
        }

        // 如果没有找到完全匹配的结果，进行微调
        if (bestResult) {
            const quality = bestResult.quality;
            const scale = bestResult.scale;
            
            // 在最佳结果附近进行精细调整
            for (let q = quality - 0.01; q <= quality + 0.01; q += 0.001) {
                if (q < 0 || q > 1) continue;
                const blob = await tryCompress(scale, q);
                const diff = Math.abs(blob.size - targetSize);
                
                if (diff < closestDiff) {
                    closestDiff = diff;
                    bestResult = {
                        blob,
                        extension,
                        quality: q,
                        scale
                    };
                    
                    // 如果误差小于0.1%，认为已经足够精确
                    if (diff / targetSize < 0.001) {
                        break;
                    }
                }
            }
        }

        return {
            blob: bestResult.blob,
            extension,
            quality: bestResult.quality,
            scale: bestResult.scale
        };
    }

    // 压缩单个图片
    async function compressImage(file, settings) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    let { width, height } = img;
                    
                    // 调整尺寸
                    if (settings.maxWidth || settings.maxHeight) {
                        const ratio = width / height;
                        
                        if (settings.maintainAspectRatio) {
                            if (settings.maxWidth && width > settings.maxWidth) {
                                width = settings.maxWidth;
                                height = width / ratio;
                            }
                            if (settings.maxHeight && height > settings.maxHeight) {
                                height = settings.maxHeight;
                                width = height * ratio;
                            }
                        } else {
                            width = settings.maxWidth || width;
                            height = settings.maxHeight || height;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 设置输出格式
                    let outputType = file.type;
                    if (settings.format !== 'original') {
                        outputType = `image/${settings.format}`;
                    }
                    
                    const quality = outputType.includes('jpeg') || outputType.includes('webp') ? 0.8 : undefined;
                    
                    canvas.toBlob(
                        (blob) => resolve({
                            blob,
                            extension: `.${outputType.split('/')[1]}`
                        }),
                        outputType,
                        quality
                    );
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // 添加到历史记录
    function addToHistory(count, originalSize, compressedSize) {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-item-info">
                <div class="history-item-date">${new Date().toLocaleString()}</div>
                <div class="history-item-stats">
                    处理：${count}张图片 | 
                    原始：${formatFileSize(originalSize)} | 
                    压缩后：${formatFileSize(compressedSize)} | 
                    节省：${formatFileSize(originalSize - compressedSize)}
                </div>
            </div>
        `;
        compressionHistory.insertBefore(historyItem, compressionHistory.firstChild);
    }

    // 修改更新按钮状态函数
    function updateButtons() {
        const hasImages = imageQueue.length > 0;
        const hasSelectedImages = document.querySelectorAll('.image-checkbox:checked').length > 0;
        const isSingleImage = imageQueue.length === 1;
        
        compressBtn.disabled = !hasImages;
        compress300kBtn.disabled = !hasImages;
        
        // 修改下载选中按钮的状态和文本
        if (isSingleImage) {
            downloadSelectedBtn.disabled = false;
            downloadSelectedBtn.textContent = '下载图片';
        } else {
            downloadSelectedBtn.disabled = !hasImages || !hasSelectedImages;
            downloadSelectedBtn.textContent = '下载选中图片';
        }
        
        if (hasImages) {
            compressBtn.textContent = `压缩 ${imageQueue.length} 张图片`;
            compress300kBtn.textContent = `压缩 ${imageQueue.length} 张图片至300KB`;
        } else {
            compressBtn.textContent = '压缩图片';
            compress300kBtn.textContent = '压缩至300KB';
        }
    }

    // 修改下载选中图片的函数
    async function downloadSelectedImages() {
        let selectedImages;
        
        if (imageQueue.length === 1) {
            // 单张图片时直接使用该图片
            selectedImages = imageQueue;
        } else {
            // 多张图片时使用选中的图片
            selectedImages = Array.from(document.querySelectorAll('.image-checkbox:checked')).map(
                checkbox => imageQueue.find(img => img.id === checkbox.id.replace('check_', ''))
            );

            if (selectedImages.length === 0) {
                // 显示错误提示
                const allImages = document.querySelectorAll('.image-item');
                allImages.forEach(item => {
                    item.classList.add('highlight');
                    setTimeout(() => item.classList.remove('highlight'), 1000);
                });
                alert('请先选择要下载的图片！');
                return;
            }
        }

        if (selectedImages.length === 1) {
            // 单张图片直接下载
            const image = selectedImages[0];
            const compressedImg = image.element.querySelector('.preview-compressed img');
            if (compressedImg.src.startsWith('data:')) {
                alert('请先压缩图片！');
                return;
            }
            const link = document.createElement('a');
            link.href = compressedImg.src;
            // 根据设置的输出格式修改文件扩展名
            const extension = outputFormat.value === 'original' 
                ? image.name.match(/\.[^/.]+$/)[0]
                : `.${outputFormat.value}`;
            const baseName = image.name.replace(/\.[^/.]+$/, '');
            link.download = `${filePrefix.value || 'compressed_'}${baseName}${extension}`;
            link.click();
        } else {
            // 多张图片打包下载
            const zip = new JSZip();
            for (const image of selectedImages) {
                const compressedImg = image.element.querySelector('.preview-compressed img');
                if (!compressedImg.src.startsWith('data:')) {
                    const response = await fetch(compressedImg.src);
                    const blob = await response.blob();
                    // 根据设置的输出格式修改文件扩展名
                    const extension = outputFormat.value === 'original' 
                        ? image.name.match(/\.[^/.]+$/)[0]
                        : `.${outputFormat.value}`;
                    const baseName = image.name.replace(/\.[^/.]+$/, '');
                    zip.file(`${filePrefix.value || 'compressed_'}${baseName}${extension}`, blob);
                }
            }
            
            const zipBlob = await zip.generateAsync({type: 'blob'});
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'selected_compressed_images.zip';
            link.click();
        }
    }

    // 格式化文件大小
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 事件监听
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
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    compressBtn.addEventListener('click', () => {
        if (compressBtn.dataset.mode === 'custom') {
            const size = parseFloat(customSize.value);
            if (!size || size <= 0) {
                alert('请输入有效的目标大小');
                return;
            }
            compressImages('custom');
        } else {
            compressImages('normal');
        }
    });

    // 添加设置面板和历史记录的折叠功能
    toggleSettings.addEventListener('click', () => {
        settingsContent.classList.toggle('collapsed');
        toggleSettings.textContent = settingsContent.classList.contains('collapsed') ? '显示' : '隐藏';
    });

    toggleHistory.addEventListener('click', () => {
        compressionHistory.classList.toggle('collapsed');
        toggleHistory.textContent = compressionHistory.classList.contains('collapsed') ? '显示' : '隐藏';
    });

    // 修改自定义大小输入的事件处理
    customSize.addEventListener('input', () => {
        const size = parseFloat(customSize.value);
        const unit = sizeUnit.value;
        if (size > 0) {
            compressBtn.textContent = `压缩至 ${size}${unit}`;
            compressBtn.dataset.mode = 'custom';
        } else {
            compressBtn.textContent = '压缩图片';
            compressBtn.dataset.mode = 'normal';
        }
    });

    sizeUnit.addEventListener('change', () => {
        if (customSize.value) {
            const size = parseFloat(customSize.value);
            const unit = sizeUnit.value;
            if (size > 0) {
                compressBtn.textContent = `压缩至 ${size}${unit}`;
            }
        }
    });

    // 添加复选框变化事件监听
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('image-checkbox') && e.target.id !== 'selectAll') {
            updateSelectAllState();
            updateButtons();
        }
    });

    // 添加下载选中图片按钮事件监听
    downloadSelectedBtn.addEventListener('click', downloadSelectedImages);

    // 添加全选功能
    selectAll.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.image-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = e.target.checked;
        });
        updateButtons();
    });

    // 添加更新全选状态的函数
    function updateSelectAllState() {
        const checkboxes = Array.from(document.querySelectorAll('.image-checkbox:not(#selectAll)'));
        if (checkboxes.length === 0) {
            selectAll.checked = false;
            selectAll.disabled = true;
        } else {
            selectAll.disabled = false;
            selectAll.checked = checkboxes.every(checkbox => checkbox.checked);
        }
    }

    // 修复压缩至300KB按钮的事件监听
    compress300kBtn.addEventListener('click', () => compressImages('300k'));

    // 修改文件名前缀输入验证
    filePrefix.addEventListener('input', (e) => {
        // 移除实时验证，改为在失去焦点时验证
        // 删除这个事件监听器中的验证代码
    });

    // 修改失去焦点时的验证
    filePrefix.addEventListener('blur', (e) => {
        let value = e.target.value.trim();
        // 只在失去焦点时进行验证和格式化
        const validValue = value.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, '');
        if (value !== validValue) {
            value = validValue;
        }
        if (value && !value.endsWith('_')) {
            value += '_';
        }
        e.target.value = value || 'compressed_';
    });

    // 添加 compositionend 事件处理（用于处理中文输入完成）
    filePrefix.addEventListener('compositionend', (e) => {
        // 中文输入完成后的处理
        const value = e.target.value;
        if (value && !/^[\u4e00-\u9fa5a-zA-Z0-9_]*$/.test(value)) {
            e.target.value = value.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, '');
        }
    });

    // 修改文件名前缀的默认值
    filePrefix.value = 'compressed_';
});