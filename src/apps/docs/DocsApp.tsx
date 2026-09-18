import { BookIcon } from "../../shell/icons";
import { Placeholder } from "../../shell/Placeholder";

export function DocsApp() {
  return (
    <div data-font="content" className="h-full">
      <Placeholder
        icon={BookIcon}
        title="文档中心"
        hint="文档导航与收藏。在这里实现分组、搜索，以及跳转默认浏览器打开。"
      />
    </div>
  );
}
