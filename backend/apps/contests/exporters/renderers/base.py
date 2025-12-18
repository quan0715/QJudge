"""
Base renderer class for contest exporters.
"""
from abc import ABC, abstractmethod
from typing import Any

from ..data_service import ContestDataService
from ..locales import get_labels, is_chinese


class BaseRenderer(ABC):
    """
    Abstract base class for all renderers.
    Provides common functionality and defines the interface.
    """

    def __init__(self, contest, language: str = 'zh-TW'):
        """
        Initialize the renderer.

        Args:
            contest: Contest model instance
            language: Language code for localization
        """
        self.contest = contest
        self.language = language
        self._data_service = None
        self._labels = None

    @property
    def data_service(self) -> ContestDataService:
        """Lazy-loaded data service instance."""
        if self._data_service is None:
            self._data_service = ContestDataService(self.contest, self.language)
        return self._data_service

    @property
    def labels(self) -> dict:
        """Lazy-loaded labels dictionary."""
        if self._labels is None:
            self._labels = get_labels(self.language)
        return self._labels

    @property
    def is_chinese(self) -> bool:
        """Check if current language is Chinese."""
        return is_chinese(self.language)

    def get_label(self, key: str, default: str = '') -> str:
        """
        Get a localized label by key.

        Args:
            key: Label key
            default: Default value if key not found

        Returns:
            Localized string
        """
        return self.labels.get(key, default)

    @abstractmethod
    def export(self) -> Any:
        """
        Export the contest data.

        Returns:
            Exported data (format depends on renderer type)
        """
        pass
