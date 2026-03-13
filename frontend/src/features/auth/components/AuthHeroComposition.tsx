import React from 'react';
import { useTranslation } from 'react-i18next';
import './AuthHeroComposition.scss';

const AuthHeroComposition: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="auth-hero-composition">
      <div className="auth-hero-composition__svg-wrap">
        <img
          src="/illustrations/online_test.svg"
          alt="Online Test"
          className="auth-hero-composition__svg"
        />
      </div>

      <div className="auth-hero-features">
        <div className="feature-item">
          <div className="feature-title">{t('auth.login.feature1Title')}</div>
          <div className="feature-desc">{t('auth.login.feature1Desc')}</div>
        </div>
        <div className="feature-item">
          <div className="feature-title">{t('auth.login.feature2Title')}</div>
          <div className="feature-desc">{t('auth.login.feature2Desc')}</div>
        </div>
        <div className="feature-item">
          <div className="feature-title">{t('auth.login.feature3Title')}</div>
          <div className="feature-desc">{t('auth.login.feature3Desc')}</div>
        </div>
      </div>
    </div>
  );
};

export default AuthHeroComposition;
