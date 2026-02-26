import React from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Button,
  Tag,
} from "@carbon/react";
import { TrashCan } from "@carbon/icons-react";
import type { ClassroomMember } from "@/core/entities/classroom.entity";

interface MemberTableProps {
  members: ClassroomMember[];
  isPrivileged: boolean;
  onRemove: (userId: number) => void;
}

const headers = [
  { key: "username", header: "Username" },
  { key: "email", header: "Email" },
  { key: "role", header: "角色" },
  { key: "joinedAt", header: "加入時間" },
  { key: "actions", header: "" },
];

export const MemberTable: React.FC<MemberTableProps> = ({
  members,
  isPrivileged,
  onRemove,
}) => {
  const rows = members.map((m) => ({
    id: String(m.userId),
    username: m.username,
    email: m.email,
    role: m.role,
    joinedAt: new Date(m.joinedAt).toLocaleDateString(),
    actions: m.userId,
  }));

  return (
    <DataTable rows={rows} headers={isPrivileged ? headers : headers.slice(0, -1)}>
      {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }) => (
        <Table {...getTableProps()} size="md">
          <TableHead>
            <TableRow>
              {tableHeaders.map((header) => (
                <TableHeader {...getHeaderProps({ header })} key={header.key}>
                  {header.header}
                </TableHeader>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tableRows.map((row) => (
              <TableRow {...getRowProps({ row })} key={row.id}>
                {row.cells.map((cell) => {
                  if (cell.info.header === "role") {
                    return (
                      <TableCell key={cell.id}>
                        <Tag type={cell.value === "ta" ? "purple" : "teal"} size="sm">
                          {cell.value}
                        </Tag>
                      </TableCell>
                    );
                  }
                  if (cell.info.header === "actions" && isPrivileged) {
                    return (
                      <TableCell key={cell.id}>
                        <Button
                          kind="ghost"
                          size="sm"
                          hasIconOnly
                          renderIcon={TrashCan}
                          iconDescription="移除"
                          onClick={() => onRemove(cell.value as number)}
                        />
                      </TableCell>
                    );
                  }
                  return <TableCell key={cell.id}>{cell.value}</TableCell>;
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DataTable>
  );
};
