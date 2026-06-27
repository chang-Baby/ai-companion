'use client';

import { useState, useRef } from 'react';
import { CHARACTERS } from '@/app/data/characters';
import type { ChatSettings, DisplayCharacter } from '../ChatClient';

interface SettingsModalProps {
  character: DisplayCharacter;
  onSave: (settings: ChatSettings) => void;
  onClose: () => void;
}

const PRESET_STYLES = [
  { value: 'gentle', label: '温柔倾听' },
  { value: 'tsundere', label: '傲娇猫系' },
  { value: 'humorous', label: '幽默伙伴' },
  { value: 'coach', label: '考研陪练' },
  { value: 'custom', label: '自定义' },
];

function isImageAvatar(avatar: string): boolean {
  return avatar.startsWith('data:') || avatar.startsWith('http');
}

export default function SettingsModal({ character, onSave, onClose }: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPreset, setSelectedPreset] = useState<string | 'custom'>(
    character.isCustom ? 'custom' : character.id
  );
  const [customName, setCustomName] = useState(
    character.isCustom ? character.displayName : ''
  );
  const [selectedStyle, setSelectedStyle] = useState(
    character.isCustom ? character.style : character.style
  );
  const [customStyleDesc, setCustomStyleDesc] = useState(
    character.isCustom ? character.displayStyleDesc : ''
  );
  const [customDesc, setCustomDesc] = useState(
    character.isCustom ? character.customDesc : ''
  );
  const [avatarUrl, setAvatarUrl] = useState(
    isImageAvatar(character.displayAvatar) ? character.displayAvatar : ''
  );
  const [uploadedAvatar, setUploadedAvatar] = useState(
    character.displayAvatar.startsWith('data:') ? character.displayAvatar : ''
  );
  const [previewAvatar, setPreviewAvatar] = useState(character.displayAvatar);

  const handlePresetSelect = (id: string | 'custom') => {
    setSelectedPreset(id);
    if (id !== 'custom') {
      const char = CHARACTERS.find((c) => c.id === id)!;
      setCustomName(char.name);
      setSelectedStyle(char.style);
      setCustomStyleDesc(char.styleDesc);
      setCustomDesc(char.description);
      setAvatarUrl('');
      setUploadedAvatar('');
      setPreviewAvatar(char.emoji);
    }
  };

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
    if (url) {
      setPreviewAvatar(url);
      setUploadedAvatar('');
    } else if (!uploadedAvatar) {
      if (selectedPreset !== 'custom') {
        setPreviewAvatar(CHARACTERS.find((c) => c.id === selectedPreset)?.emoji || '🤖');
      } else {
        setPreviewAvatar('🤖');
      }
    }
  };

  const getFinalAvatar = (): string => {
    if (uploadedAvatar) return uploadedAvatar;
    if (avatarUrl) return avatarUrl;
    if (selectedPreset !== 'custom') {
      return CHARACTERS.find((c) => c.id === selectedPreset)?.emoji || '🤖';
    }
    return '🤖';
  };

  const getFinalName = (): string => {
    if (selectedPreset !== 'custom') {
      return CHARACTERS.find((c) => c.id === selectedPreset)?.name || '';
    }
    return customName;
  };

  const handleSave = () => {
    const settings: ChatSettings = {
      isCustom: selectedPreset === 'custom',
      customName: getFinalName(),
      customDesc,
      customStyleDesc: selectedStyle === 'custom' ? customStyleDesc : '',
      avatar: getFinalAvatar(),
      style: selectedStyle,
    };
    onSave(settings);
  };

  const avatarIsImage = isImageAvatar(previewAvatar);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <h2 className="modal-title">角色设定</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 主体 */}
        <div className="modal-body">
          {/* 头像预览 */}
          <div className="modal-avatar-section">
            <div className="modal-avatar-wrapper">
              {avatarIsImage ? (
                <img src={previewAvatar} alt="头像" className="modal-avatar-img" />
              ) : (
                <div className="modal-avatar-emoji">{previewAvatar}</div>
              )}
            </div>
          </div>

          {/* 预设角色 */}
          <div className="modal-setting-group">
            <label className="modal-label">选择预设角色</label>
            <div className="modal-preset-grid">
              {CHARACTERS.map((char) => (
                <button
                  key={char.id}
                  className={`modal-preset-btn ${selectedPreset === char.id ? 'modal-preset-active' : ''}`}
                  onClick={() => handlePresetSelect(char.id)}
                >
                  <span>{char.emoji}</span>
                  <span>{char.name}</span>
                </button>
              ))}
              <button
                className={`modal-preset-btn ${selectedPreset === 'custom' ? 'modal-preset-active' : ''}`}
                onClick={() => handlePresetSelect('custom')}
              >
                <span>✨</span>
                <span>自定义</span>
              </button>
            </div>
          </div>

          {/* 自定义设定 */}
          {selectedPreset === 'custom' && (
            <div className="modal-custom-section">
              <div className="modal-setting-group">
                <label className="modal-label">角色名字</label>
                <input
                  type="text"
                  className="modal-input"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="给你的 AI 伙伴起个名字..."
                />
              </div>

              <div className="modal-row">
                <div className="modal-setting-group" style={{ flex: 1 }}>
                  <label className="modal-label">说话风格</label>
                  <select
                    className="modal-select"
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value)}
                  >
                    {PRESET_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {selectedStyle === 'custom' && (
                  <div className="modal-setting-group" style={{ flex: 1 }}>
                    <label className="modal-label">风格描述</label>
                    <input
                      type="text"
                      className="modal-input"
                      value={customStyleDesc}
                      onChange={(e) => setCustomStyleDesc(e.target.value)}
                      placeholder="描述你想要的风格..."
                    />
                  </div>
                )}
              </div>

              <div className="modal-setting-group">
                <label className="modal-label">角色描述</label>
                <textarea
                  className="modal-textarea"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="描述角色的性格、背景、说话方式..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* 头像设定 */}
          <div className="modal-setting-group">
            <label className="modal-label">自定义头像</label>
            <div className="modal-avatar-row">
              <input
                type="text"
                className="modal-input"
                value={avatarUrl}
                onChange={(e) => handleAvatarUrlChange(e.target.value)}
                placeholder="输入头像图片链接..."
                disabled={!!uploadedAvatar}
                style={{ flex: 1 }}
              />
              <span className="modal-or">或</span>
              <button
                className="modal-upload-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                📁 上传
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="modal-file-input"
                onChange={handleAvatarUpload}
              />
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose}>取消</button>
          <button className="modal-save-btn" onClick={handleSave}>保存设定</button>
        </div>
      </div>
    </div>
  );
}