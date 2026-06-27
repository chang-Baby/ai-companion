'use client';

import { useState, useRef } from 'react';
import type { DisplayCharacter, CustomCharacter } from '../../data/types';

interface SettingsModalProps {
  mode: 'edit' | 'create';
  character?: DisplayCharacter;  // edit mode only
  onSave: ((data: { avatar: string }) => void) | ((data: CustomCharacter) => void);
  onClose: () => void;
  onDelete?: () => void;
}

function isImageUrl(s: string): boolean {
  return s.startsWith('data:') || s.startsWith('http');
}

export default function SettingsModal({ mode, character, onSave, onClose, onDelete }: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCreate = mode === 'create';

  // 编辑模式：初始值来自现有角色
  const [name, setName] = useState(isCreate ? '' : character?.name || '');
  const [styleDesc, setStyleDesc] = useState(isCreate ? '' : character?.styleDesc || '');
  const [description, setDescription] = useState(isCreate ? '' : character?.description || '');
  const [avatarUrl, setAvatarUrl] = useState(isCreate ? '' : (character?.displayAvatar && isImageUrl(character.displayAvatar) ? character.displayAvatar : ''));
  const [uploadedAvatar, setUploadedAvatar] = useState('');
  const [previewAvatar, setPreviewAvatar] = useState(isCreate ? '🤖' : character?.displayAvatar || '🤖');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setUploadedAvatar(base64);
      setPreviewAvatar(base64);
      setAvatarUrl('');
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUrlChange = (url: string) => {
    setAvatarUrl(url);
    if (url) { setPreviewAvatar(url); setUploadedAvatar(''); }
    else if (!uploadedAvatar) { setPreviewAvatar(character?.emoji || '🤖'); }
  };

  const getFinalAvatar = () => uploadedAvatar || avatarUrl || '';

  const handleSave = () => {
    if (isCreate) {
      if (!name.trim()) return;
      const customChar: CustomCharacter = {
        id: '',
        name: name.trim(),
        emoji: '🤖',
        title: '自定义角色',
        description: description.trim() || `由你创造的 AI 伙伴`,
        personality: styleDesc.trim() || description.trim() || '善解人意',
        styleDesc: styleDesc.trim() || '按你设定的方式交流',
        systemPrompt: buildCustomPrompt(name.trim(), description.trim(), styleDesc.trim()),
        features: [],
        avatar: getFinalAvatar() || undefined,
        createdAt: new Date().toISOString(),
      };
      (onSave as (data: CustomCharacter) => void)(customChar);
    } else {
      (onSave as (data: { avatar: string }) => void)({ avatar: getFinalAvatar() });
    }
  };

  const avatarIsImage = isImageUrl(previewAvatar);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isCreate ? '创建新角色' : '角色设定'}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* 头像 */}
          <div className="modal-avatar-section">
            <div className="modal-avatar-wrapper">
              {avatarIsImage ? (
                <img src={previewAvatar} alt="头像" className="modal-avatar-img" />
              ) : (
                <div className="modal-avatar-emoji">{previewAvatar}</div>
              )}
            </div>
          </div>

          {/* 创建模式：完整表单 */}
          {isCreate && (
            <>
              <div className="modal-setting-group">
                <label className="modal-label">角色名字 *</label>
                <input type="text" className="modal-input" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="给你的 AI 伙伴起个名字..." />
              </div>

              <div className="modal-setting-group">
                <label className="modal-label">说话风格 & 性格描述</label>
                <textarea className="modal-textarea" value={styleDesc}
                  onChange={(e) => setStyleDesc(e.target.value)}
                  placeholder={"自由描述你想要的风格和性格，比如：\n\"温柔体贴的大姐姐，喜欢用颜文字，会记住我说过的每件小事，偶尔撒娇但关键时刻很靠谱\"\n\nAI 会按照这个描述来塑造角色行为"}
                  rows={4} />
              </div>

              <div className="modal-setting-group">
                <label className="modal-label">角色简介</label>
                <textarea className="modal-textarea" value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="一句话介绍这个角色的背景和定位..."
                  rows={2} />
              </div>
            </>
          )}

          {/* 编辑模式：显示当前信息（只读）+ 可改头像 */}
          {!isCreate && character && (
            <>
              <div className="modal-info-row">
                <span className="modal-label">名字</span>
                <span className="modal-info-value">{character.name}</span>
              </div>
              <div className="modal-info-row">
                <span className="modal-label">风格</span>
                <span className="modal-info-value">{character.styleDesc}</span>
              </div>
              <div className="modal-info-row">
                <span className="modal-label">类型</span>
                <span className="modal-info-value">{character.isPreset ? '预设角色' : '自定义角色'}</span>
              </div>
            </>
          )}

          {/* 头像设定（两种模式都有） */}
          <div className="modal-setting-group">
            <label className="modal-label">自定义头像</label>
            <div className="modal-avatar-row">
              <input type="text" className="modal-input" value={avatarUrl}
                onChange={(e) => handleAvatarUrlChange(e.target.value)}
                placeholder="输入头像图片链接..." disabled={!!uploadedAvatar} style={{ flex: 1 }} />
              <span className="modal-or" style={{ flexShrink: 0, color: '#475569', fontSize: 12 }}>或</span>
              <button className="modal-upload-btn" onClick={() => fileInputRef.current?.click()}>📁 上传</button>
              <input ref={fileInputRef} type="file" accept="image/*" className="modal-file-input" onChange={handleAvatarUpload} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div style={{ display: 'flex', gap: 10, flex: 1 }}>
            {onDelete && (
              deleteConfirm ? (
                <>
                  <span style={{ color: '#f87171', fontSize: 13, alignSelf: 'center' }}>确认删除？</span>
                  <button className="modal-delete-confirm-btn" onClick={onDelete}>确认删除</button>
                  <button className="modal-cancel-btn" onClick={() => setDeleteConfirm(false)}>取消</button>
                </>
              ) : (
                <button className="modal-delete-btn" onClick={() => setDeleteConfirm(true)}>🗑️ 删除角色</button>
              )
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="modal-cancel-btn" onClick={onClose}>取消</button>
            <button className="modal-save-btn" onClick={handleSave}>
              {isCreate ? '创建角色' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildCustomPrompt(name: string, description: string, styleDesc: string): string {
  return `你是${name}，${description || '一个由用户创造的 AI 伙伴'}

【你的性格和说话风格】
${styleDesc || '善解人意、友好温暖'}

【关于你面前的这个人】
{memory}

【回复规则】
- 用中文回复
- 严格遵守上面设定的性格和风格
- 像真正的朋友一样自然交流
- 记住用户告诉你的信息
- 让对话有温度、有个性`;
}