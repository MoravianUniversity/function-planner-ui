import{i as e}from"./function-planner-DEPTSx9-.js";import"./ui-yMus3xAk.js";import"./yjs-DLZ4IDYl.js";const t={functions:[{key:1,name:"main",io:"indirect"},{key:2,name:"read_list_of_students",desc:"Read all of the names of students from the given file into a list.",params:[],returns:[{type:"list[str]",desc:"the student names from the file"}],io:"none",testable:!1,code:`with open("students.txt") as file:
    return [line.strip() for line in file]`},{key:3,name:"get_new_grade",desc:"Get a new grade for the given student from the user. It is required to be an int between 0 and 100. If the user enters an invalid grade, they will be shown an error and prompted to enter a new one.",params:[{name:"student_name",type:"str",desc:"the student to get a grade for"}],returns:[{type:"int",desc:"the new grade for the student"}],io:"validation",testable:!1,code:`while True:
    try:
        grade = int(input(f"Enter the grade for {student_name}: "))
        if 0 <= grade <= 100:
            return grade
        else:
            print("Grade must be between 0 and 100.")
    except ValueError:
        print("Grade must be a number.")`},{key:4,name:"median",desc:"Calculate the median of the given list of grades.",params:[{name:"list_of_grades",type:"list[int]",desc:"the grades to calculate the median of"}],returns:[{type:"float",desc:"the median of the grades"}],io:"none",testable:!0,testCode:`assert grades.median([1, 2, 3]) == 2
assert grades.median([100, 1, 3]) == 3
assert grades.median([1]) == 1
assert grades.median([2, 1]) == 1.5
assert grades.median([1, 2]) == 1.5
assert grades.median([0, 0]) == 0
assert grades.median([100, -1, 100, 100]) == 100
assert grades.median([0, 100, 100, 0]) == 50
`}],calls:[{from:1,to:2}]};window.addEventListener("DOMContentLoaded",()=>{e("planner","grades",{initialModel:t,allowedTypes:["int","float","str","bool","list"],minFunctions:8,minTestable:3,adminMode:!1,showCodeFor:"^(read_list_of_students|get_new_grade)$",showTestCodeFor:"^median$",functionReadOnly:[{for:"^main$",fields:["name","desc","params","returns"]},{for:"^read_list_of_students$",fields:!0},{for:"^get_new_grade$",fields:["name","desc","params","returns","io","testable","code"]},{for:"^median$",fields:["name","desc","params","returns","io","testable","testCode"]}]})});
