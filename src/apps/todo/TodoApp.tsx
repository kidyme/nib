import { CheckSquareIcon } from "../../shell/icons";
import { Placeholder } from "../../shell/Placeholder";

export function TodoApp() {
  return (
    <div data-font="content" className="h-full">
      <Placeholder
        icon={CheckSquareIcon}
        title="TODO"
        hint="待办面板。壳子、配色 token、持久化约定已经就位，接下来在这里实现列表、优先级和提醒。"
      />
    </div>
  );
}
