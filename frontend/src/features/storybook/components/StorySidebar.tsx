import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layer } from "@carbon/react";
import {
  ChevronDown,
  ChevronRight,
  Cube,
  ColorPalette,
  Template,
  Apps,
  Folder,
} from "@carbon/icons-react";
import type { CategoryGroup, FolderGroup, RegistryItem } from "@/shared/types/story.types";

interface StorySidebarProps {
  categories: CategoryGroup[];
  currentPath: string;
}

// Category icons mapping
const categoryIcons: Record<string, React.ElementType> = {
  shared: Cube,
  ui: ColorPalette,
  features: Apps,
  layouts: Template,
};

const StorySidebar: React.FC<StorySidebarProps> = ({
  categories,
  currentPath,
}) => {
  const navigate = useNavigate();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );

  // Auto-expand category and folder containing current component
  useEffect(() => {
    categories.forEach((cat) => {
      cat.folders.forEach((folder) => {
        const hasActive = folder.items.some((item) => item.path === currentPath);
        if (hasActive) {
          setExpandedCategories((prev) => new Set([...prev, cat.id]));
          setExpandedFolders((prev) => new Set([...prev, `${cat.id}/${folder.id}`]));
        }
      });
    });
  }, [currentPath, categories]);

  const handleNavigation = (path: string) => {
    navigate(`/dev/storybook/${path}`);
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Count total items in category
  const getCategoryItemCount = (category: CategoryGroup) => {
    return category.folders.reduce((acc, folder) => acc + folder.items.length, 0);
  };

  return (
    <Layer>
      <nav
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: "auto",
          }}
        >
          {categories.map((category) => {
            const Icon = categoryIcons[category.id] || Cube;
            const isCategoryExpanded = expandedCategories.has(category.id);
            const hasActiveItem = category.folders.some((folder) =>
              folder.items.some((item) => item.path === currentPath)
            );

            return (
              <div key={category.id} style={{ marginBottom: "0.25rem" }}>
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  type="button"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1rem",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: hasActiveItem
                      ? "var(--cds-text-primary)"
                      : "var(--cds-text-secondary)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    textAlign: "left",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--cds-layer-hover-01)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <Icon size={16} />
                  <span style={{ flex: 1 }}>{category.name}</span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-helper)",
                    }}
                  >
                    {getCategoryItemCount(category)}
                  </span>
                  {isCategoryExpanded ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>

                {/* Folders */}
                {isCategoryExpanded && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {category.folders.map((folder: FolderGroup) => {
                      const folderId = `${category.id}/${folder.id}`;
                      const isFolderExpanded = expandedFolders.has(folderId);
                      const hasFolderActiveItem = folder.items.some(
                        (item) => item.path === currentPath
                      );

                      return (
                        <div key={folder.id}>
                          {/* Folder Header */}
                          <button
                            onClick={() => toggleFolder(folderId)}
                            type="button"
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.5rem 1rem 0.5rem 2rem",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              color: hasFolderActiveItem
                                ? "var(--cds-text-primary)"
                                : "var(--cds-text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 500,
                              textAlign: "left",
                              transition: "background-color 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "var(--cds-layer-hover-01)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                            }}
                          >
                            <Folder size={14} />
                            <span style={{ flex: 1 }}>{folder.name}</span>
                            <span
                              style={{
                                fontSize: "0.6875rem",
                                color: "var(--cds-text-helper)",
                              }}
                            >
                              {folder.items.length}
                            </span>
                            {isFolderExpanded ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </button>

                          {/* Folder Items */}
                          {isFolderExpanded && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              {folder.items.map((item: RegistryItem) => {
                                const isActive = currentPath === item.path;

                                return (
                                  <button
                                    key={item.path}
                                    onClick={() => handleNavigation(item.path)}
                                    type="button"
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "0.5rem",
                                      padding: "0.5rem 1rem 0.5rem 3.5rem",
                                      background: isActive
                                        ? "var(--cds-layer-selected-01)"
                                        : "transparent",
                                      border: "none",
                                      borderLeft: isActive
                                        ? "3px solid var(--cds-border-interactive)"
                                        : "3px solid transparent",
                                      cursor: "pointer",
                                      color: isActive
                                        ? "var(--cds-text-primary)"
                                        : "var(--cds-text-secondary)",
                                      fontSize: "0.8125rem",
                                      fontWeight: isActive ? 600 : 400,
                                      textAlign: "left",
                                      transition: "all 0.15s ease",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActive) {
                                        e.currentTarget.style.backgroundColor =
                                          "var(--cds-layer-hover-01)";
                                        e.currentTarget.style.color =
                                          "var(--cds-text-primary)";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isActive) {
                                        e.currentTarget.style.backgroundColor =
                                          "transparent";
                                        e.currentTarget.style.color =
                                          "var(--cds-text-secondary)";
                                      }
                                    }}
                                  >
                                    {item.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </Layer>
  );
};

export default StorySidebar;
